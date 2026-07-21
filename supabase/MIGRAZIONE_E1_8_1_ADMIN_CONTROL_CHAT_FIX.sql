-- MARILAB MOVER E1.8.1 - CONTROLLO ADMIN E FIX CHAT PRIVATE
-- Autore ufficiale: Fabio Carratù
-- Eseguire UNA SOLA VOLTA nel SQL Editor del progetto Supabase operativo.
-- Corregge: invio chat private, eliminazione chat solo Admin, pulizia completa chat,
-- eliminazione Admin di richieste/consegne in qualsiasi stato.

begin;

-- Rimuove il vecchio overload a 4 parametri rimasto dallo schema iniziale.
-- Quella funzione consentiva di creare notifiche senza i controlli introdotti in E1.6.9.
drop function if exists public.create_app_notification(text, text, text, uuid);

-- Verifica sicura del destinatario della chat privata senza esporre i profili agli altri utenti.
create or replace function public.is_active_chat_recipient(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.active = true
  );
$$;

revoke all on function public.is_active_chat_recipient(uuid) from public, anon;
grant execute on function public.is_active_chat_recipient(uuid) to authenticated;

-- La precedente policy interrogava direttamente profiles: con RLS attiva il destinatario
-- poteva risultare invisibile agli utenti non Admin e l'invio privato veniva rifiutato.
drop policy if exists chat_insert_active on public.chat_messages;
create policy chat_insert_active on public.chat_messages
for insert to authenticated
with check (
  public.is_active_user()
  and sender_id = auth.uid()
  and (recipient_id is null or recipient_id <> auth.uid())
  and not (request_id is not null and recipient_id is not null)
  and (recipient_id is null or public.is_active_chat_recipient(recipient_id))
);

-- Qualsiasi eliminazione di messaggi è riservata agli Admin.
-- La rimozione è definitiva: il messaggio scompare dalla conversazione.
create or replace function public.delete_chat_message(p_message_id bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare target public.chat_messages%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Funzione riservata agli Admin';
  end if;

  select * into target
  from public.chat_messages
  where id = p_message_id;

  if target.id is null then
    raise exception 'Messaggio non trovato';
  end if;

  delete from public.chat_messages
  where id = p_message_id;

  return true;
end;
$$;

-- Svuota definitivamente la conversazione selezionata e le relative notifiche chat.
create or replace function public.admin_clear_chat_conversation(
  p_request_id uuid default null,
  p_other_user_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare affected integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Funzione riservata agli Admin';
  end if;

  if p_request_id is not null and p_other_user_id is not null then
    raise exception 'Conversazione non valida';
  end if;

  if p_other_user_id is not null then
    delete from public.chat_messages
    where request_id is null
      and (
        (sender_id = auth.uid() and recipient_id = p_other_user_id)
        or (sender_id = p_other_user_id and recipient_id = auth.uid())
      );

    get diagnostics affected = row_count;

    delete from public.app_notifications
    where kind = 'chat'
      and request_id is null
      and (
        (created_by = auth.uid() and recipient_user_id = p_other_user_id)
        or (created_by = p_other_user_id and recipient_user_id = auth.uid())
      );
  elsif p_request_id is not null then
    delete from public.chat_messages
    where request_id = p_request_id
      and recipient_id is null;

    get diagnostics affected = row_count;

    delete from public.app_notifications
    where kind = 'chat'
      and request_id = p_request_id;
  else
    delete from public.chat_messages
    where request_id is null
      and recipient_id is null;

    get diagnostics affected = row_count;

    delete from public.app_notifications
    where kind = 'chat'
      and request_id is null
      and recipient_user_id is null;
  end if;

  return affected;
end;
$$;

-- Cancella tutte le chat: generale, private e collegate alle consegne.
-- Vengono rimosse anche le notifiche di tipo chat e le relative letture in cascata.
create or replace function public.admin_clear_all_chats()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_messages integer := 0;
  deleted_notifications integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Funzione riservata agli Admin';
  end if;

  delete from public.chat_messages;
  get diagnostics deleted_messages = row_count;

  delete from public.app_notifications
  where kind = 'chat';
  get diagnostics deleted_notifications = row_count;

  return jsonb_build_object(
    'deleted_messages', deleted_messages,
    'deleted_notifications', deleted_notifications
  );
end;
$$;

-- L'Admin può eliminare definitivamente qualsiasi richiesta/consegna,
-- indipendentemente dallo stato. Gli elementi collegati sono rimossi in cascata.
create or replace function public.admin_delete_delivery_request(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare target public.delivery_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Funzione riservata agli Admin';
  end if;

  select * into target
  from public.delivery_requests
  where id = p_request_id;

  if target.id is null then
    raise exception 'Richiesta o consegna non trovata';
  end if;

  delete from public.delivery_requests
  where id = p_request_id;

  return true;
end;
$$;

revoke all on function public.delete_chat_message(bigint) from public, anon;
revoke all on function public.admin_clear_chat_conversation(uuid, uuid) from public, anon;
revoke all on function public.admin_clear_all_chats() from public, anon;
revoke all on function public.admin_delete_delivery_request(uuid) from public, anon;

grant execute on function public.delete_chat_message(bigint) to authenticated;
grant execute on function public.admin_clear_chat_conversation(uuid, uuid) to authenticated;
grant execute on function public.admin_clear_all_chats() to authenticated;
grant execute on function public.admin_delete_delivery_request(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
