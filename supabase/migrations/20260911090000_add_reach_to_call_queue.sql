insert into public.column_definitions
  (user_id, table_view, column_key, column_label, column_type, is_visible, is_default, sort_order)
select cd.user_id, 'call_queue', 'platform', 'Reach', 'reach', true, true, max(cd.sort_order) + 1
from public.column_definitions cd
where cd.table_view = 'call_queue'
  and not exists (
    select 1 from public.column_definitions x
    where x.user_id = cd.user_id and x.table_view = 'call_queue' and x.column_key = 'platform')
group by cd.user_id;
