ALTER TABLE firm_config
  DROP CONSTRAINT IF EXISTS firm_config_pricing_structure_check;

ALTER TABLE firm_config
  ADD CONSTRAINT firm_config_pricing_structure_check
  CHECK (pricing_structure IN ('hourly', 'flat_fee', 'both', 'retainer'));
