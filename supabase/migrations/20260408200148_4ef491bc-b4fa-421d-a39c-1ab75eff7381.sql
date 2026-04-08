ALTER TABLE public.profiles ADD COLUMN email text;

-- Backfill from auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.user_id;