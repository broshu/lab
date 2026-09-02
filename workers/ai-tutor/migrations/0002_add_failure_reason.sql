-- 失败原因代号（auth:401 / balance:402 / rate_limit:429 / upstream_down:503 / network / timeout …）。
-- status='answered' 的记录这一列为空。
ALTER TABLE tutor_questions ADD COLUMN failure_reason TEXT;
