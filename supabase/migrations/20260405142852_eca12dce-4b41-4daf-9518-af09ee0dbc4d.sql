
-- Rate limit log table
CREATE TABLE public.rate_limit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  endpoint text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_rate_limit_log_lookup ON public.rate_limit_log (key, endpoint, created_at DESC);

-- Enable RLS but no public policies (service role only)
ALTER TABLE public.rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Atomic check-and-insert function
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _key text,
  _endpoint text,
  _limit int DEFAULT 5,
  _window_seconds int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count int;
  _cutoff timestamptz;
BEGIN
  _cutoff := now() - (_window_seconds || ' seconds')::interval;
  
  -- Clean old entries for this key/endpoint
  DELETE FROM public.rate_limit_log
  WHERE key = _key AND endpoint = _endpoint AND created_at < _cutoff;
  
  -- Count recent entries
  SELECT count(*) INTO _count
  FROM public.rate_limit_log
  WHERE key = _key AND endpoint = _endpoint AND created_at >= _cutoff;
  
  IF _count >= _limit THEN
    RETURN false;
  END IF;
  
  -- Log this request
  INSERT INTO public.rate_limit_log (key, endpoint) VALUES (_key, _endpoint);
  
  RETURN true;
END;
$$;
