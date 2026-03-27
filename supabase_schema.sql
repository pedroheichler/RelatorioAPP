-- ============================================================
-- RelatorioAPP — Schema Supabase
-- Execute no SQL Editor do Supabase (https://supabase.com/dashboard)
-- ============================================================

-- 1. Perfis de profissionais (1 por usuário)
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  title       text,                    -- Ex: Psicóloga Clínica
  registry    text,                    -- Ex: CRP 09/12345
  clinic_name text,
  clinic_sub  text,                    -- subtítulo da clínica
  logo_url    text,                    -- URL do Storage
  signature_url text,                  -- URL do Storage
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- RLS: cada usuário só acessa o próprio perfil
alter table profiles enable row level security;

create policy "Usuário lê próprio perfil"
  on profiles for select using (auth.uid() = id);

create policy "Usuário edita próprio perfil"
  on profiles for update using (auth.uid() = id);

create policy "Usuário insere próprio perfil"
  on profiles for insert with check (auth.uid() = id);


-- 2. Histórico de documentos gerados
create table if not exists documents (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade,
  template_id  text not null,          -- Ex: relatorio_sessao
  template_name text not null,
  patient_name text,
  doc_date     date,
  created_at   timestamptz default now()
);

-- RLS: cada profissional só vê os próprios documentos
alter table documents enable row level security;

create policy "Usuário lê próprios documentos"
  on documents for select using (auth.uid() = user_id);

create policy "Usuário insere próprios documentos"
  on documents for insert with check (auth.uid() = user_id);

create policy "Usuário deleta próprios documentos"
  on documents for delete using (auth.uid() = user_id);


-- 3. Storage buckets (crie manualmente no painel Storage)
-- Bucket: "avatars"   → logo e assinatura dos profissionais
-- Política sugerida: authenticated users podem fazer upload no próprio folder (user_id/*)


-- 4. Trigger: cria perfil automaticamente ao cadastrar usuário
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
