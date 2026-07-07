-- mystudiobee/supabase/migrations/0011_profit_split_real_values.sql
-- Replaces the generic placeholder profit-split tiers with the actual studio policy
-- values from "Studio Bee — Profit-Share Structure for Outsourced Work" (v1, June 2026).
insert into profit_split_settings (category, floor, threshold, tiers) values
('video', 8000, 50000, '[
  {"max":15000,"mode":"simple","company_pct":47,"executor_pct":40,"manager_pct":13},
  {"max":50000,"mode":"simple","company_pct":57,"executor_pct":31,"manager_pct":12},
  {"max":null,"mode":"cost-plus","company_pct":66,"executor_pct":26,"manager_pct":8}
]'),
('web', 35000, 75000, '[
  {"max":75000,"mode":"simple","company_pct":48,"executor_pct":30,"client_handling_pct":14,"origination_pct":8},
  {"max":null,"mode":"cost-plus","company_pct":58,"executor_pct":26,"client_handling_pct":9,"origination_pct":7}
]'),
('design', 1000, 25000, '[
  {"max":3000,"mode":"simple","company_pct":42,"executor_pct":45,"manager_pct":13},
  {"max":10000,"mode":"simple","company_pct":52,"executor_pct":36,"manager_pct":12},
  {"max":25000,"mode":"simple","company_pct":60,"executor_pct":30,"manager_pct":10},
  {"max":null,"mode":"cost-plus","company_pct":66,"executor_pct":26,"manager_pct":8}
]'),
('retainer', 0, 0, '[
  {"max":null,"mode":"cost-plus","company_pct":65,"executor_pct":25,"manager_pct":10}
]')
on conflict (category) do update set
  floor = excluded.floor,
  threshold = excluded.threshold,
  tiers = excluded.tiers;
