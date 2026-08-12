/**
 * app.js — RelatorioAPP
 *
 * Fluxo: escolher documento → ditar → revisar o texto da IA → baixar .docx.
 * O servidor só gera texto e monta o arquivo; todo o resto é local.
 *
 * Dados no navegador (localStorage):
 *   relatorioAppSettings   → perfil, timbre, abordagem, preferências
 *   relatorioAppPatients   → pacientes salvos, para não redigitar toda semana
 *   relatorioAppHistory    → documentos gerados, para reabrir e dar contexto
 *   relatorioAppDraft:<id> → rascunho por tipo de documento
 *   relatorioAppTheme      → claro/escuro (lido também no <head>)
 */
(() => {
    'use strict';

    const SETTINGS_KEY = 'relatorioAppSettings';
    const PATIENTS_KEY = 'relatorioAppPatients';
    const HISTORY_KEY = 'relatorioAppHistory';
    const THEME_KEY = 'relatorioAppTheme';
    const DRAFT_PREFIX = 'relatorioAppDraft:';
    const HISTORY_LIMIT = 30;

    // Marcas de acentuação decompostas pelo NFD (U+0300–U+036F), em escape ASCII
    const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

    const state = {
        templates: [],
        template: null,
        formData: {},
        sections: [],   // [{ key, label, text }] — `text` guarda o original da IA
        summary: [],
        title: '',
    };

    let settings = {};
    let patients = [];
    let history = [];
    let installPrompt = null;

    const $ = (id) => document.getElementById(id);
    const el = {};

    // ─────────────────────────────────────────
    // Utilidades
    // ─────────────────────────────────────────
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const nameKey = (name) => String(name || '')
        .normalize('NFD').replace(COMBINING_MARKS, '')
        .toLowerCase().replace(/\s+/g, ' ').trim();

    const formatDateBR = (iso) => {
        const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
    };

    const todayIso = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const countWords = (text) => String(text || '').trim().split(/\s+/).filter(Boolean).length;

    const wordLabel = (n) => (n === 1 ? '1 palavra' : `${n} palavras`);

    /**
     * Nome como aparece nas listas. Com "ocultar nomes" ligado vira iniciais —
     * a tela do consultório costuma ficar visível para quem entra na sala.
     */
    function displayName(name) {
        const raw = String(name || '').trim();
        if (!raw) return '';
        if (!settings.maskNames) return raw;
        return raw.split(/\s+/).filter(Boolean).map((part) => `${part[0].toUpperCase()}.`).join(' ');
    }

    let toastTimer = null;
    function toast(message, isError = false) {
        el.toast.textContent = message;
        el.toast.classList.toggle('error', isError);
        el.toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.toast.classList.remove('show'), isError ? 6000 : 3200);
    }

    function showLoading(text, hint = '') {
        el.loadingText.textContent = text;
        el.loadingHint.textContent = hint;
        el.loading.classList.add('active');
    }

    const hideLoading = () => el.loading.classList.remove('active');

    async function readError(response) {
        try {
            const body = await response.json();
            if (body && body.error) return body.error;
        } catch { /* não era JSON */ }
        if (response.status === 429) return 'Muitas gerações seguidas. Aguarde alguns minutos.';
        if (response.status === 503) return 'O servidor está sem chave de IA configurada.';
        return `Falha na comunicação com o servidor (${response.status}).`;
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // A Clipboard API exige contexto seguro; em http:// cai aqui
            try {
                const area = document.createElement('textarea');
                area.value = text;
                area.style.position = 'fixed';
                area.style.opacity = '0';
                document.body.appendChild(area);
                area.select();
                const ok = document.execCommand('copy');
                area.remove();
                return ok;
            } catch {
                return false;
            }
        }
    }

    // ─────────────────────────────────────────
    // Tema
    // ─────────────────────────────────────────
    const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
    const MOON = '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';

    const systemPrefersDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    function effectiveTheme() {
        const attr = document.documentElement.getAttribute('data-theme');
        if (attr === 'dark' || attr === 'light') return attr;
        return systemPrefersDark() ? 'dark' : 'light';
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        try { localStorage.setItem(THEME_KEY, theme); } catch { /* modo privado */ }
        $('themeIcon').innerHTML = theme === 'dark' ? SUN : MOON;
        $('themeToggle').setAttribute('aria-label',
            theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro');
    }

    // ─────────────────────────────────────────
    // Armazenamento
    // ─────────────────────────────────────────
    function readJson(key, fallback) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || 'null');
            return parsed === null ? fallback : parsed;
        } catch {
            return fallback;
        }
    }

    /** Devolve false (em vez de estourar) quando a cota do navegador acaba. */
    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (err) {
            const isQuota = err && /quota|exceed/i.test(`${err.name}${err.message}`);
            toast(isQuota
                ? 'Espaço do navegador cheio. Limpe o histórico em Configurações.'
                : 'Não foi possível salvar neste navegador.', true);
            return false;
        }
    }

    const persistSettings = () => writeJson(SETTINGS_KEY, settings);
    const persistPatients = () => writeJson(PATIENTS_KEY, patients);

    /** Se a cota estourar, descarta os mais antigos antes de desistir. */
    function persistHistory() {
        for (let attempt = 0; attempt < 4; attempt += 1) {
            try {
                localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
                return true;
            } catch {
                if (history.length <= 1) break;
                history = history.slice(0, Math.max(1, Math.floor(history.length / 2)));
            }
        }
        toast('Espaço do navegador cheio — o histórico foi reduzido.', true);
        return false;
    }

    // ─────────────────────────────────────────
    // Pacientes
    // ─────────────────────────────────────────
    function upsertPatient(data) {
        const name = String(data.patientName || '').trim();
        if (!name) return;

        const key = nameKey(name);
        const existing = patients.find((p) => nameKey(p.name) === key);
        const sessionNumber = Number(data.sessionNumber);

        const record = existing || { id: newId(), name };
        record.name = name;
        if (data.birthDate) record.birthDate = data.birthDate;
        if (Number.isFinite(sessionNumber) && sessionNumber > 0) record.lastSessionNumber = sessionNumber;
        record.updatedAt = new Date().toISOString();

        if (!existing) patients.push(record);
        patients.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        persistPatients();
    }

    function renderPatientPicker() {
        const container = $('patientBar');
        const hasPatientField = state.template.fields.some((f) => f.key === 'patientName');

        if (!hasPatientField) {
            container.hidden = true;
            container.innerHTML = '';
            return;
        }

        const options = patients
            .map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(displayName(p.name))}</option>`)
            .join('');

        container.hidden = false;
        container.innerHTML = `
            <label for="patientPicker">Paciente</label>
            <select id="patientPicker">
                <option value="">— Novo paciente —</option>
                ${options}
            </select>
            <span class="hint">${patients.length
                ? 'Preenche nome, nascimento e o próximo número de sessão.'
                : 'O primeiro paciente é salvo quando você baixar um documento.'}</span>
            <div class="check-row" id="contextRow" hidden>
                <input type="checkbox" id="usePreviousContext">
                <label for="usePreviousContext" style="font-weight:400;margin:0">
                    <span data-context-label></span>
                </label>
            </div>`;

        $('patientPicker').addEventListener('change', (event) => applyPatient(event.target.value));
        updateContextRow();
    }

    function applyPatient(patientId) {
        const patient = patients.find((p) => p.id === patientId);
        if (!patient) { updateContextRow(); return; }

        setFieldValue('patientName', patient.name);
        if (patient.birthDate) setFieldValue('birthDate', patient.birthDate);
        if (Number.isFinite(patient.lastSessionNumber)) {
            setFieldValue('sessionNumber', String(patient.lastSessionNumber + 1));
        }
        updateContextRow();
        scheduleDraftSave();
    }

    function setFieldValue(key, value) {
        const input = el.dataForm.querySelector(`[name="${key}"]`);
        if (input) input.value = value;
    }

    // ─────────────────────────────────────────
    // Histórico
    // ─────────────────────────────────────────
    function latestHistoryFor(patientName) {
        const key = nameKey(patientName);
        if (!key) return null;
        return history.find((entry) => nameKey(entry.patientName) === key) || null;
    }

    function previousContextText(entry) {
        if (!entry || !entry.content) return '';
        return Object.values(entry.content)
            .map((text) => String(text || '').trim())
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 4000);
    }

    /** Mostra a opção de contexto só quando existe documento anterior. */
    function updateContextRow() {
        const row = $('contextRow');
        if (!row) return;

        const nameInput = el.dataForm.querySelector('[name="patientName"]');
        const entry = latestHistoryFor(nameInput ? nameInput.value : '');
        row.hidden = !entry;
        if (!entry) return;

        // Continuidade importa mais em evolução, sessão e PTS
        $('usePreviousContext').checked = ['evolucao', 'relatorio_sessao', 'pts'].includes(state.template.id);
        row.querySelector('[data-context-label]').innerHTML =
            `Usar como contexto o documento anterior deste paciente
             (${escapeHtml(entry.templateName)}, ${escapeHtml(formatDateBR(entry.docDate))}).
             <strong>O texto anterior será enviado à IA.</strong>`;
    }

    function saveToHistory() {
        const entry = {
            id: newId(),
            templateId: state.template.id,
            templateName: state.template.name,
            title: state.title || state.template.name,
            patientName: state.formData.patientName || '',
            docDate: state.formData.sessionDate || state.formData.date || todayIso(),
            formData: state.formData,
            content: collectEditedContent(),
            createdAt: new Date().toISOString(),
        };

        history.unshift(entry);
        if (history.length > HISTORY_LIMIT) history = history.slice(0, HISTORY_LIMIT);
        persistHistory();
        return entry;
    }

    function historyRowHtml(entry, withDelete) {
        return `
            <div class="row-card">
                <span class="meta">
                    <strong>${escapeHtml(displayName(entry.patientName) || entry.title)}</strong>
                    <small>${escapeHtml(entry.templateName)} · ${escapeHtml(formatDateBR(entry.docDate))}</small>
                </span>
                <span style="display:flex;gap:var(--s2);flex-shrink:0">
                    <button type="button" class="btn btn-outline btn-sm" data-open="${escapeHtml(entry.id)}">Abrir</button>
                    ${withDelete ? `<button type="button" class="btn btn-quiet btn-sm" data-delete="${escapeHtml(entry.id)}">Excluir</button>` : ''}
                </span>
            </div>`;
    }

    function renderHistory() {
        $('historyList').innerHTML = history.length
            ? history.map((entry) => historyRowHtml(entry, true)).join('')
            : '<p class="empty">Nenhum documento gerado ainda.<br>Os que você baixar aparecem aqui.</p>';
    }

    function openHistoryEntry(id) {
        const entry = history.find((item) => item.id === id);
        if (!entry) return;

        const template = state.templates.find((t) => t.id === entry.templateId);
        if (!template) {
            toast('O tipo de documento deste registro não existe mais.', true);
            return;
        }

        state.template = template;
        state.formData = entry.formData || {};
        state.title = entry.title;
        state.sections = template.sections.map(({ key, label }) => ({
            key, label, text: (entry.content && entry.content[key]) || '',
        }));
        state.summary = summaryFromFormData(template, state.formData);

        $('step2Title').textContent = template.name;
        renderForm();
        for (const [key, value] of Object.entries(state.formData)) {
            if (typeof value === 'string') setFieldValue(key, value);
        }

        renderReview(entry.title);
        toggleModal('historyModal', false);
        goToStep(3);
    }

    /**
     * Resumo reconstruído a partir do formulário. O servidor devolve o dele em
     * /api/preview; aqui é para reabrir do histórico sem precisar de rede.
     */
    function summaryFromFormData(template, data) {
        return template.fields
            .filter((field) => field.type !== 'textarea')
            .map((field) => ({
                label: field.label,
                value: field.type === 'date' ? formatDateBR(data[field.key]) : (data[field.key] || ''),
            }))
            .filter((row) => row.value);
    }

    // ─────────────────────────────────────────
    // Tela inicial
    // ─────────────────────────────────────────
    function renderHome() {
        renderResume();
        renderRecent();
        updateGreeting();
    }

    function updateGreeting() {
        const hour = new Date().getHours();
        const part = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
        const who = (settings.profName || '').trim().split(/\s+/)[0];
        $('greeting').textContent = who
            ? `${part}, ${who}. Escolha o tipo de documento para começar.`
            : 'Escolha o tipo de documento para começar.';
    }

    /** Rascunhos com conteúdo real, para retomar direto da tela inicial. */
    function findDrafts() {
        const drafts = [];
        for (const template of state.templates) {
            const draft = readJson(`${DRAFT_PREFIX}${template.id}`, null);
            if (!draft || typeof draft !== 'object') continue;

            const notes = String(draft.notes || draft.justification || '').trim();
            if (!notes) continue;

            drafts.push({
                templateId: template.id,
                templateName: template.name,
                patientName: draft.patientName || '',
                words: countWords(notes),
            });
        }
        return drafts;
    }

    function renderResume() {
        const drafts = findDrafts();
        $('resumeBlock').hidden = drafts.length === 0;

        $('resumeList').innerHTML = drafts.map((draft) => {
            const who = displayName(draft.patientName);
            return `<button type="button" class="row-card" data-resume="${escapeHtml(draft.templateId)}">
                <span class="meta">
                    <strong>${escapeHtml(draft.templateName)}</strong>
                    <small>${who ? `${escapeHtml(who)} · ` : ''}${wordLabel(draft.words)} anotadas</small>
                </span>
                <span class="chev" aria-hidden="true">→</span>
            </button>`;
        }).join('');
    }

    function renderRecent() {
        const recent = history.slice(0, 4);
        $('recentBlock').hidden = recent.length === 0;
        $('recentList').innerHTML = recent.map((entry) => historyRowHtml(entry, false)).join('');
    }

    // ─────────────────────────────────────────
    // Navegação
    // ─────────────────────────────────────────
    function goToStep(step) {
        document.querySelectorAll('.step').forEach((section) => section.classList.remove('active'));
        $(`step${step}`).classList.add('active');

        el.stepper.querySelectorAll('li').forEach((item) => {
            const value = Number(item.dataset.step);
            item.classList.toggle('done', value < step);
            if (value === step) item.setAttribute('aria-current', 'step');
            else item.removeAttribute('aria-current');
        });

        if (step === 1 && state.templates.length) renderHome();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ─────────────────────────────────────────
    // Configurações
    // ─────────────────────────────────────────
    function loadSettings() {
        settings = readJson(SETTINGS_KEY, {}) || {};
        for (const [key, value] of Object.entries(settings)) {
            const input = el.settingsForm.querySelector(`[name="${key}"]`);
            if (input && input.type !== 'checkbox' && typeof value === 'string') input.value = value;
        }
        $('maskNames').checked = Boolean(settings.maskNames);
        applyImagePreview('logoData', settings.logoData);
        applyImagePreview('signatureData', settings.signatureData);
        updateStorageInfo();
    }

    async function loadApproaches() {
        let approaches = [{ id: 'generico', label: 'Geral / não especificar' }];
        try {
            const response = await fetch('/api/approaches');
            if (response.ok) approaches = await response.json();
        } catch { /* offline: fica só o genérico */ }

        $('approach').innerHTML = approaches
            .map((a) => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.label)}</option>`)
            .join('');
        if (settings.approach) $('approach').value = settings.approach;
    }

    function applyImagePreview(store, dataUrl) {
        const isLogo = store === 'logoData';
        const preview = $(isLogo ? 'logoPreview' : 'signaturePreview');
        const actions = $(isLogo ? 'logoActions' : 'signatureActions');

        if (dataUrl) {
            preview.src = dataUrl;
            preview.style.display = 'block';
            actions.style.display = 'block';
        } else {
            preview.removeAttribute('src');
            preview.style.display = 'none';
            actions.style.display = 'none';
        }
    }

    function updateStorageInfo() {
        $('storageInfo').textContent =
            `${patients.length} paciente(s) e ${history.length} documento(s) guardados.`;
    }

    /**
     * Redimensiona e converte para PNG.
     * Dois motivos: o docx@8.5 sempre declara a mídia como PNG (mandar JPEG
     * gera pacote não-conforme), e uma foto de 4 MB em base64 estoura a cota
     * do localStorage.
     */
    async function fileToPng(file, maxWidth, maxHeight) {
        const source = await loadImageSource(file);
        const scale = Math.min(1, maxWidth / source.width, maxHeight / source.height);
        const width = Math.max(1, Math.round(source.width * scale));
        const height = Math.max(1, Math.round(source.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(source.image, 0, 0, width, height);

        if (source.revoke) source.revoke();
        return canvas.toDataURL('image/png');
    }

    async function loadImageSource(file) {
        if (typeof createImageBitmap === 'function') {
            const bitmap = await createImageBitmap(file);
            return { image: bitmap, width: bitmap.width, height: bitmap.height };
        }
        const url = URL.createObjectURL(file);
        try {
            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('Imagem inválida.'));
                img.src = url;
            });
            return {
                image, width: image.naturalWidth, height: image.naturalHeight,
                revoke: () => URL.revokeObjectURL(url),
            };
        } catch (err) {
            URL.revokeObjectURL(url);
            throw err;
        }
    }

    function dataUrlToBlob(dataUrl) {
        if (!dataUrl || !dataUrl.startsWith('data:')) return null;
        try {
            const [header, payload] = dataUrl.split(',');
            const mime = header.match(/:(.*?);/)[1];
            const binary = atob(payload);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
            return new Blob([bytes], { type: mime });
        } catch {
            return null;
        }
    }

    // ─────────────────────────────────────────
    // Templates e formulário
    // ─────────────────────────────────────────
    async function fetchTemplates() {
        el.templateGrid.innerHTML = '<div class="skeleton"></div>'.repeat(6);
        try {
            const response = await fetch('/api/templates');
            if (!response.ok) throw new Error(await readError(response));
            state.templates = await response.json();
            renderTemplates();
            renderHome();
        } catch (err) {
            el.templateGrid.innerHTML = '<p class="empty">Não foi possível carregar os documentos.<br>Verifique a conexão e recarregue a página.</p>';
            toast(err.message, true);
        }
    }

    function renderTemplates() {
        el.templateGrid.innerHTML = state.templates.map((template) => `
            <button type="button" class="template-card" data-template="${escapeHtml(template.id)}">
                <span class="title">${escapeHtml(template.name)}</span>
                <small>${template.sections.length} seções</small>
            </button>
        `).join('');
    }

    function selectTemplate(id) {
        const template = state.templates.find((item) => item.id === id);
        if (!template) return;

        state.template = template;
        $('step2Title').textContent = template.name;
        renderForm();
        restoreDraft();
        goToStep(2);
    }

    function fieldMarkup(field) {
        const id = `field_${field.key}`;
        const required = field.required ? 'required' : '';
        const mark = field.required
            ? ' <span class="req" aria-hidden="true">*</span>'
            : ' <span class="optional">(opcional)</span>';
        const hint = field.hint ? `<span class="hint">${escapeHtml(field.hint)}</span>` : '';
        const span = field.key === 'patientName' ? ' span-all' : '';

        let control;
        if (field.type === 'select') {
            const options = (field.options || [])
                .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
                .join('');
            control = `<select id="${id}" name="${escapeHtml(field.key)}" ${required}>
                    <option value="">Selecione…</option>${options}
                </select>`;
        } else {
            const extra = field.type === 'number' ? ' min="1" step="1"' : '';
            control = `<input type="${escapeHtml(field.type)}" id="${id}" name="${escapeHtml(field.key)}"${extra} ${required}>`;
        }

        return `<div class="field${span}">
                <label for="${id}">${escapeHtml(field.label)}${mark}</label>
                ${control}${hint}
            </div>`;
    }

    /**
     * O campo de anotações não é "mais um textarea": é a razão de o app
     * existir. Ganha bloco próprio, com botão de ditado rotulado, tempo
     * decorrido, contagem de palavras e o texto provisório em linha separada.
     */
    function composerMarkup(field) {
        const id = `field_${field.key}`;
        const required = field.required ? 'required' : '';
        const mark = field.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
        const hint = field.hint ? `<span class="hint">${escapeHtml(field.hint)}</span>` : '';

        return `<div class="field">
                <label for="${id}">${escapeHtml(field.label)}${mark}</label>
                <div class="composer" data-composer="${escapeHtml(field.key)}">
                    <textarea id="${id}" name="${escapeHtml(field.key)}" ${required}
                        placeholder="Fale ou escreva livremente. Frases soltas bastam — a IA organiza nas seções do documento."></textarea>
                    <div class="interim" data-interim></div>
                    <div class="composer-bar">
                        <button type="button" class="rec-btn" data-voice="${escapeHtml(field.key)}" aria-pressed="false">
                            <span class="rec-dot" aria-hidden="true"></span>
                            <span data-rec-label>Ditar</span>
                        </button>
                        <span class="composer-status">
                            <span class="bars" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
                            <span data-timer hidden></span>
                            <span data-words>0 palavras</span>
                        </span>
                    </div>
                </div>${hint}
            </div>`;
    }

    function renderForm() {
        const notes = state.template.fields.filter((f) => f.type === 'textarea');
        const meta = state.template.fields.filter((f) => f.type !== 'textarea');

        el.dataForm.innerHTML =
            (meta.length ? `<div class="field-row">${meta.map(fieldMarkup).join('')}</div>` : '')
            + notes.map(composerMarkup).join('');

        if (!voice.supported) {
            el.dataForm.querySelectorAll('[data-voice]').forEach((button) => { button.hidden = true; });
        }

        prefillDates();
        renderPatientPicker();
        el.dataForm.querySelectorAll('textarea').forEach(updateWordCount);
    }

    /** Datas em branco começam em hoje — poupa cliques no uso diário. */
    function prefillDates() {
        const iso = todayIso();
        for (const field of state.template.fields) {
            if (field.type !== 'date' || field.key === 'birthDate' || field.key === 'reviewDate') continue;
            const input = el.dataForm.querySelector(`[name="${field.key}"]`);
            if (input && !input.value) input.value = iso;
        }
    }

    function updateWordCount(textarea) {
        const composer = textarea.closest('.composer');
        if (!composer) return;
        composer.querySelector('[data-words]').textContent = wordLabel(countWords(textarea.value));
    }

    function collectForm() {
        const data = {};
        for (const [key, value] of new FormData(el.dataForm).entries()) {
            data[key] = typeof value === 'string' ? value.trim() : value;
        }
        return data;
    }

    /**
     * Validação de verdade. Antes os botões ficavam FORA do <form>, então o
     * `required` nunca era avaliado e dava para gerar documento vazio.
     */
    function validateForm() {
        for (const field of state.template.fields) {
            const input = el.dataForm.querySelector(`[name="${field.key}"]`);
            if (!input) continue;
            if (field.required && !input.value.trim()) {
                input.focus();
                input.scrollIntoView({ block: 'center', behavior: 'smooth' });
                toast(`Preencha: ${field.label}.`, true);
                return false;
            }
        }
        return true;
    }

    // ─────────────────────────────────────────
    // Rascunho automático
    // ─────────────────────────────────────────
    let draftTimer = null;
    const draftKey = () => `${DRAFT_PREFIX}${state.template.id}`;

    function scheduleDraftSave() {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(() => {
            if (!state.template) return;
            try {
                localStorage.setItem(draftKey(), JSON.stringify(collectForm()));
            } catch { /* rascunho é conveniência: não bloqueia o fluxo */ }
        }, 600);
    }

    function restoreDraft() {
        el.draftNotice.hidden = true;
        const draft = readJson(draftKey(), null);
        if (!draft || typeof draft !== 'object') return;

        const meaningful = Object.entries(draft).some(([key, value]) => {
            const field = state.template.fields.find((item) => item.key === key);
            return field && field.type !== 'date' && String(value || '').trim();
        });

        for (const [key, value] of Object.entries(draft)) {
            if (typeof value === 'string') setFieldValue(key, value);
        }
        el.dataForm.querySelectorAll('textarea').forEach(updateWordCount);
        el.draftNotice.hidden = !meaningful;
        updateContextRow();
    }

    function clearDraft() {
        if (!state.template) return;
        try { localStorage.removeItem(draftKey()); } catch { /* ignora */ }
        el.draftNotice.hidden = true;
    }

    // ─────────────────────────────────────────
    // Ditado por voz
    // ─────────────────────────────────────────
    const voice = {
        Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
        get supported() { return Boolean(this.Recognition); },
        recognition: null,
        fieldKey: null,
        composer: null,
        baseText: '',
        pending: null,
        startedAt: 0,
        timer: null,

        /**
         * Alternar entre campos funciona: antes, clicar no microfone de outro
         * campo apenas parava a gravação em curso, sem iniciar a nova.
         */
        toggle(fieldKey) {
            if (!this.supported) {
                toast('Seu navegador não suporta ditado. Use Chrome ou Edge.', true);
                return;
            }
            if (this.recognition) {
                this.pending = this.fieldKey === fieldKey ? null : { fieldKey };
                this.recognition.stop();
                return;
            }
            this.start(fieldKey);
        },

        start(fieldKey) {
            const composer = el.dataForm.querySelector(`[data-composer="${fieldKey}"]`);
            const textarea = composer && composer.querySelector('textarea');
            if (!textarea) return;

            const recognition = new this.Recognition();
            recognition.lang = 'pt-BR';
            recognition.continuous = true;
            recognition.interimResults = true;

            this.recognition = recognition;
            this.fieldKey = fieldKey;
            this.composer = composer;
            this.baseText = textarea.value ? `${textarea.value.replace(/\s+$/, '')} ` : '';

            recognition.onstart = () => {
                composer.classList.add('recording');
                composer.querySelector('[data-voice]').setAttribute('aria-pressed', 'true');
                composer.querySelector('[data-rec-label]').textContent = 'Parar';
                composer.querySelector('[data-interim]').textContent = 'Ouvindo…';
                this.startedAt = Date.now();
                this.tick();
                this.timer = setInterval(() => this.tick(), 1000);
            };

            recognition.onresult = (event) => {
                let final = '';
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; i += 1) {
                    const chunk = event.results[i][0].transcript;
                    if (event.results[i].isFinal) final += `${chunk} `;
                    else interim += chunk;
                }
                // Só o texto definitivo entra no campo; o provisório fica na
                // linha de baixo, para parar no meio da frase não deixar sobra.
                this.baseText += final;
                textarea.value = this.baseText;
                composer.querySelector('[data-interim]').textContent = interim || 'Ouvindo…';
                updateWordCount(textarea);
                scheduleDraftSave();
            };

            recognition.onerror = (event) => {
                if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                    toast('Permissão de microfone negada. Libere nas configurações do navegador.', true);
                } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    toast(`Erro no ditado: ${event.error}`, true);
                }
            };

            recognition.onend = () => {
                this.cleanup(textarea);
                const next = this.pending;
                this.pending = null;
                if (next) this.start(next.fieldKey);
            };

            try {
                recognition.start();
            } catch {
                this.cleanup(textarea);
                toast('Não foi possível iniciar o ditado.', true);
            }
        },

        tick() {
            if (!this.composer) return;
            const seconds = Math.floor((Date.now() - this.startedAt) / 1000);
            const label = this.composer.querySelector('[data-timer]');
            label.hidden = false;
            label.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        },

        cleanup(textarea) {
            clearInterval(this.timer);
            this.timer = null;

            if (this.composer) {
                this.composer.classList.remove('recording');
                this.composer.querySelector('[data-voice]').setAttribute('aria-pressed', 'false');
                this.composer.querySelector('[data-rec-label]').textContent = 'Ditar';
                this.composer.querySelector('[data-interim]').textContent = '';
                this.composer.querySelector('[data-timer]').hidden = true;
            }
            if (textarea) {
                textarea.value = textarea.value.trimEnd();
                updateWordCount(textarea);
            }

            this.recognition = null;
            this.fieldKey = null;
            this.composer = null;
            scheduleDraftSave();
        },

        stopIfActive() {
            if (this.recognition) {
                this.pending = null;
                this.recognition.stop();
            }
        },
    };

    // ─────────────────────────────────────────
    // Geração
    // ─────────────────────────────────────────
    function professionalPayload() {
        return {
            name: settings.profName || '',
            title: settings.profTitle || '',
            registry: settings.profRegistry || '',
            approach: settings.approach || 'generico',
            styleNotes: settings.styleNotes || '',
        };
    }

    function requireProfessionalSettings() {
        if (settings.profName && settings.profName.trim()) return true;
        toast('Preencha seu nome nas configurações antes de gerar.', true);
        toggleModal('settingsModal', true);
        return false;
    }

    async function generatePreview() {
        if (!validateForm() || !requireProfessionalSettings()) return;

        voice.stopIfActive();
        state.formData = collectForm();

        const row = $('contextRow');
        const useContext = $('usePreviousContext');
        const previousContext = row && !row.hidden && useContext && useContext.checked
            ? previousContextText(latestHistoryFor(state.formData.patientName))
            : '';

        showLoading('Gerando o texto…', 'Costuma levar de 5 a 20 segundos.');
        try {
            const response = await fetch('/api/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId: state.template.id,
                    data: state.formData,
                    professional: professionalPayload(),
                    previousContext,
                }),
            });
            if (!response.ok) throw new Error(await readError(response));

            const result = await response.json();
            state.sections = result.sections || [];
            state.summary = result.summary || [];
            state.title = result.title || state.template.name;
            renderReview(state.title);
            goToStep(3);
        } catch (err) {
            toast(err.message, true);
        } finally {
            hideLoading();
        }
    }

    function renderReview(title) {
        $('step3Title').textContent = title || 'Revise antes de baixar';
        resetPostDownloadActions();

        $('summary').innerHTML = state.summary
            .map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`)
            .join('');

        el.reviewSections.innerHTML = state.sections.map((section, index) => `
            <div class="review-section" data-index="${index}">
                <div class="review-head">
                    <label for="section_${index}">${escapeHtml(section.label)}</label>
                    <span class="review-tools">
                        <span class="badge" data-edited hidden>editado</span>
                        <span data-count></span>
                        <button type="button" class="btn btn-quiet btn-sm" data-copy="${index}">Copiar</button>
                    </span>
                </div>
                <textarea id="section_${index}" data-section="${index}">${escapeHtml(section.text)}</textarea>
            </div>
        `).join('');

        el.reviewSections.querySelectorAll('textarea').forEach((textarea) => {
            autoGrow(textarea);
            updateSectionMeta(textarea);
        });
    }

    function autoGrow(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.max(textarea.scrollHeight + 4, 96)}px`;
    }

    /** Contagem de palavras e marca "editado", comparando com o texto da IA. */
    function updateSectionMeta(textarea) {
        const wrapper = textarea.closest('.review-section');
        const index = Number(textarea.dataset.section);
        const original = (state.sections[index] || {}).text || '';

        wrapper.querySelector('[data-count]').textContent = wordLabel(countWords(textarea.value));
        wrapper.querySelector('[data-edited]').hidden = textarea.value.trim() === original.trim();
    }

    function collectEditedContent() {
        const content = {};
        state.sections.forEach((section, index) => {
            const textarea = $(`section_${index}`);
            content[section.key] = textarea ? textarea.value.trim() : section.text;
        });
        return content;
    }

    /** Texto completo em plaintext — para colar num prontuário eletrônico. */
    function documentAsText() {
        const header = state.summary.map((row) => `${row.label}: ${row.value}`).join('\n');
        const body = state.sections
            .map((section, index) => {
                const textarea = $(`section_${index}`);
                const text = (textarea ? textarea.value : section.text).trim();
                return text ? `${section.label.toUpperCase()}\n\n${text}` : '';
            })
            .filter(Boolean)
            .join('\n\n');

        return [state.title, header, body].filter(Boolean).join('\n\n');
    }

    async function downloadDocument() {
        const content = collectEditedContent();

        if (!Object.values(content).some((text) => text)) {
            toast('O documento está vazio. Escreva ao menos uma seção.', true);
            return;
        }

        const body = new FormData();
        body.append('templateId', state.template.id);
        body.append('data', JSON.stringify(state.formData));
        body.append('content', JSON.stringify(content));
        body.append('clinic', JSON.stringify({
            name: settings.clinicName || '',
            subtitle: settings.clinicSubtitle || '',
        }));
        body.append('professional', JSON.stringify(professionalPayload()));

        const logo = dataUrlToBlob(settings.logoData);
        const signature = dataUrlToBlob(settings.signatureData);
        if (logo) body.append('logo', logo, 'logo.png');
        if (signature) body.append('signature', signature, 'signature.png');

        showLoading('Montando o documento…', 'O download começa em instantes.');
        try {
            const response = await fetch('/api/gerar-form', { method: 'POST', body });
            if (!response.ok) throw new Error(await readError(response));

            const blob = await response.blob();
            const filename = filenameFromResponse(response) || `${state.template.id}_${Date.now()}.docx`;

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            upsertPatient(state.formData);
            saveToHistory();
            updateStorageInfo();
            clearDraft();
            showPostDownloadActions();
            toast('Documento baixado e salvo no histórico.');
        } catch (err) {
            toast(err.message, true);
        } finally {
            hideLoading();
        }
    }

    /** Depois de baixar, o caminho natural é o próximo paciente — não "voltar". */
    function showPostDownloadActions() {
        $('postDownload').hidden = false;
        $('downloadBtn').textContent = 'Baixar de novo';
    }

    function resetPostDownloadActions() {
        $('postDownload').hidden = true;
        $('downloadBtn').textContent = 'Baixar .docx';
    }

    function startNextPatient() {
        state.formData = {};
        state.sections = [];
        state.summary = [];
        clearDraft();
        renderForm();
        goToStep(2);
        const nameInput = el.dataForm.querySelector('[name="patientName"]');
        if (nameInput) nameInput.focus();
        toast('Pronto para o próximo. Perfil e timbre seguem configurados.');
    }

    function filenameFromResponse(response) {
        const header = response.headers.get('Content-Disposition') || '';
        const match = header.match(/filename="?([^";]+)"?/i);
        return match ? match[1] : null;
    }

    // ─────────────────────────────────────────
    // Modais
    // ─────────────────────────────────────────
    let lastFocused = null;

    function toggleModal(id, show) {
        const modal = $(id);
        modal.classList.toggle('active', show);
        if (show) {
            lastFocused = document.activeElement;
            const first = modal.querySelector('input, select, textarea, button');
            if (first) setTimeout(() => first.focus(), 50);
        } else if (lastFocused) {
            lastFocused.focus();
        }
    }

    // ─────────────────────────────────────────
    // PWA
    // ─────────────────────────────────────────
    function setupPwa() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                // Falha de registro não pode derrubar o app — segue como site normal
                navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
        }

        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            installPrompt = event;
            $('installBtn').hidden = false;
        });

        window.addEventListener('appinstalled', () => {
            installPrompt = null;
            $('installBtn').hidden = true;
            toast('App instalado. Abra pelo ícone na tela inicial.');
        });
    }

    async function promptInstall() {
        if (!installPrompt) return;
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        $('installBtn').hidden = true;
    }

    // ─────────────────────────────────────────
    // Eventos
    // ─────────────────────────────────────────
    function bindEvents() {
        el.templateGrid.addEventListener('click', (event) => {
            const card = event.target.closest('[data-template]');
            if (card) selectTemplate(card.dataset.template);
        });

        $('resumeList').addEventListener('click', (event) => {
            const card = event.target.closest('[data-resume]');
            if (card) selectTemplate(card.dataset.resume);
        });

        $('recentList').addEventListener('click', (event) => {
            const open = event.target.closest('[data-open]');
            if (open) openHistoryEntry(open.dataset.open);
        });

        el.dataForm.addEventListener('click', (event) => {
            const button = event.target.closest('[data-voice]');
            if (button) voice.toggle(button.dataset.voice);
        });

        el.dataForm.addEventListener('input', (event) => {
            scheduleDraftSave();
            if (event.target.matches('textarea')) updateWordCount(event.target);
            if (event.target.name === 'patientName') updateContextRow();
        });

        el.dataForm.addEventListener('keydown', (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                generatePreview();
            }
        });

        el.reviewSections.addEventListener('input', (event) => {
            if (event.target.matches('textarea')) {
                autoGrow(event.target);
                updateSectionMeta(event.target);
            }
        });

        el.reviewSections.addEventListener('click', async (event) => {
            const button = event.target.closest('[data-copy]');
            if (!button) return;
            const textarea = $(`section_${button.dataset.copy}`);
            const ok = await copyText(textarea ? textarea.value : '');
            toast(ok ? 'Seção copiada.' : 'Não foi possível copiar.', !ok);
        });

        $('copyAllBtn').addEventListener('click', async () => {
            const ok = await copyText(documentAsText());
            toast(ok ? 'Texto completo copiado.' : 'Não foi possível copiar.', !ok);
        });

        $('themeToggle').addEventListener('click', () => {
            applyTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
        });

        $('generateBtn').addEventListener('click', generatePreview);
        $('regenerateBtn').addEventListener('click', generatePreview);
        $('downloadBtn').addEventListener('click', downloadDocument);
        $('nextPatientBtn').addEventListener('click', startNextPatient);
        $('newTypeBtn').addEventListener('click', () => { resetPostDownloadActions(); goToStep(1); });
        $('backToTemplates').addEventListener('click', () => { voice.stopIfActive(); goToStep(1); });
        $('backToForm').addEventListener('click', () => goToStep(2));
        $('homeBtn').addEventListener('click', () => { voice.stopIfActive(); goToStep(1); });
        $('openSettings').addEventListener('click', () => toggleModal('settingsModal', true));
        $('installBtn').addEventListener('click', promptInstall);

        $('openHistory').addEventListener('click', () => {
            renderHistory();
            toggleModal('historyModal', true);
        });

        $('historyList').addEventListener('click', (event) => {
            const open = event.target.closest('[data-open]');
            if (open) { openHistoryEntry(open.dataset.open); return; }

            const remove = event.target.closest('[data-delete]');
            if (remove) {
                history = history.filter((entry) => entry.id !== remove.dataset.delete);
                persistHistory();
                renderHistory();
                updateStorageInfo();
            }
        });

        $('discardDraft').addEventListener('click', () => {
            clearDraft();
            renderForm();
            toast('Rascunho descartado.');
        });

        $('clearPatients').addEventListener('click', () => {
            if (!confirm('Apagar todos os pacientes salvos? Os documentos já baixados não são afetados.')) return;
            patients = [];
            persistPatients();
            updateStorageInfo();
            if (state.template) renderPatientPicker();
            toast('Pacientes apagados.');
        });

        $('clearHistory').addEventListener('click', () => {
            if (!confirm('Apagar todo o histórico de documentos deste navegador?')) return;
            history = [];
            persistHistory();
            updateStorageInfo();
            renderRecent();
            toast('Histórico apagado.');
        });

        document.querySelectorAll('[data-close-modal]').forEach((button) => {
            button.addEventListener('click', () => toggleModal(button.dataset.closeModal, false));
        });

        document.querySelectorAll('.modal').forEach((modal) => {
            modal.addEventListener('click', (event) => {
                if (event.target === modal) toggleModal(modal.id, false);
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            document.querySelectorAll('.modal.active').forEach((modal) => toggleModal(modal.id, false));
        });

        el.settingsForm.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!el.settingsForm.reportValidity()) return;

            for (const [key, value] of new FormData(el.settingsForm).entries()) {
                settings[key] = typeof value === 'string' ? value.trim() : value;
            }
            // Checkbox desmarcado não aparece no FormData — precisa ser lido à parte
            settings.maskNames = $('maskNames').checked;

            if (persistSettings()) {
                toast('Configurações salvas.');
                toggleModal('settingsModal', false);
                updateGreeting();
                renderRecent();
                if (state.template) renderPatientPicker();
            }
        });

        el.settingsForm.addEventListener('change', async (event) => {
            const input = event.target;
            if (input.type !== 'file') return;

            const file = input.files && input.files[0];
            if (!file) return;

            if (!file.type.startsWith('image/')) {
                toast('Selecione um arquivo de imagem.', true);
                input.value = '';
                return;
            }

            try {
                const dataUrl = await fileToPng(file, Number(input.dataset.maxW), Number(input.dataset.maxH));
                settings[input.dataset.store] = dataUrl;
                applyImagePreview(input.dataset.store, dataUrl);
                if (persistSettings()) toast('Imagem salva.');
            } catch {
                toast('Não foi possível processar essa imagem.', true);
            } finally {
                input.value = '';
            }
        });

        el.settingsForm.addEventListener('click', (event) => {
            const button = event.target.closest('[data-remove]');
            if (!button) return;
            delete settings[button.dataset.remove];
            applyImagePreview(button.dataset.remove, null);
            persistSettings();
        });
    }

    // ─────────────────────────────────────────
    // Início
    // ─────────────────────────────────────────
    function init() {
        Object.assign(el, {
            templateGrid: $('templateGrid'),
            dataForm: $('dataForm'),
            settingsForm: $('settingsForm'),
            reviewSections: $('reviewSections'),
            loading: $('loading'),
            loadingText: $('loadingText'),
            loadingHint: $('loadingHint'),
            toast: $('toast'),
            stepper: $('stepper'),
            draftNotice: $('draftNotice'),
        });

        patients = readJson(PATIENTS_KEY, []) || [];
        history = readJson(HISTORY_KEY, []) || [];

        applyTheme(effectiveTheme());
        loadSettings();
        loadApproaches();
        bindEvents();
        fetchTemplates();
        setupPwa();
        goToStep(1);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
