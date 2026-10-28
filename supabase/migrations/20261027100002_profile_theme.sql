-- Theme follows the user across devices. Null = never chosen in Settings: the device keeps its local choice (dark by
-- default). localStorage 'pc-theme' stays as the pre-paint cache so the first frame is already in the right theme.
alter table public.profiles add column theme text check (theme in ('dark','light','system'));
