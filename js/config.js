/* Каракули — настройки подключения к Supabase.
   URL и publishable-ключ можно хранить в открытом виде: защита данных держится
   на правилах доступа (Row Level Security) из supabase/schema.sql.
   НИКОГДА не вставляйте сюда secret / service_role ключ.

   providers — какие кнопки входа показывать. Каждый способ нужно отдельно включить в
   Supabase → Authentication → Sign In / Providers (инструкция в README). Доступны:
   'google', 'github', 'discord', 'apple'. */
window.KARAKULI_CONFIG = {
  supabaseUrl: 'https://dwqaopsvburojrjxrdls.supabase.co',
  supabaseKey: 'sb_publishable_vh82N5s8_IjQBlqcZI7kDA_HXtwroyu',
  providers: ['google', 'github', 'discord']
};
