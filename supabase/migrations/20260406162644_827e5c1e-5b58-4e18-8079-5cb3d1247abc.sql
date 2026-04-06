-- Drop and recreate contract_tokens FK with CASCADE
ALTER TABLE public.contract_tokens DROP CONSTRAINT contract_tokens_contract_id_fkey;
ALTER TABLE public.contract_tokens ADD CONSTRAINT contract_tokens_contract_id_fkey
  FOREIGN KEY (contract_id) REFERENCES public.contracten(id) ON DELETE CASCADE;

-- Drop and recreate contract_berichten FK with CASCADE
ALTER TABLE public.contract_berichten DROP CONSTRAINT contract_berichten_contract_id_fkey;
ALTER TABLE public.contract_berichten ADD CONSTRAINT contract_berichten_contract_id_fkey
  FOREIGN KEY (contract_id) REFERENCES public.contracten(id) ON DELETE CASCADE;