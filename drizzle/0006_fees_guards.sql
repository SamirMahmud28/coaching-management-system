-- Financial history can't be rewritten, even by a bug or a manual query (CLAUDE.md non-negotiable 5; EMS 0027–0037).
-- Charges: never deleted; their money and details never change; cancelled at most once (D43).
CREATE OR REPLACE FUNCTION fee_charges_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fee charges are never deleted; cancel the charge instead' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.student_id, NEW.course_id, NEW.fee_item_id, NEW.generation_run_id, NEW.source, NEW.title,
      NEW.period, NEW.amount, NEW.due_date, NEW.note, NEW.created_at, NEW.created_by)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.student_id, OLD.course_id, OLD.fee_item_id, OLD.generation_run_id, OLD.source, OLD.title,
      OLD.period, OLD.amount, OLD.due_date, OLD.note, OLD.created_at, OLD.created_by) THEN
    RAISE EXCEPTION 'a fee charge''s amount, dates and details never change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'CANCELLED' AND (NEW.status, NEW.cancel_reason, NEW.cancelled_at, NEW.cancelled_by)
     IS DISTINCT FROM (OLD.status, OLD.cancel_reason, OLD.cancelled_at, OLD.cancelled_by) THEN
    RAISE EXCEPTION 'a cancelled fee charge stays cancelled' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fee_charges_guard BEFORE UPDATE OR DELETE ON fee_charges FOR EACH ROW EXECUTE FUNCTION fee_charges_guard();
--> statement-breakpoint
-- Generation runs, waivers, allocations and refunds are written once and never change.
CREATE OR REPLACE FUNCTION fee_history_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are history and never change', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fee_generation_runs_guard BEFORE UPDATE OR DELETE ON fee_generation_runs FOR EACH ROW EXECUTE FUNCTION fee_history_guard();
--> statement-breakpoint
CREATE TRIGGER fee_waivers_guard BEFORE UPDATE OR DELETE ON fee_waivers FOR EACH ROW EXECUTE FUNCTION fee_history_guard();
--> statement-breakpoint
CREATE TRIGGER fee_payment_allocations_guard BEFORE UPDATE OR DELETE ON fee_payment_allocations FOR EACH ROW EXECUTE FUNCTION fee_history_guard();
--> statement-breakpoint
CREATE TRIGGER fee_refunds_guard BEFORE UPDATE OR DELETE ON fee_refunds FOR EACH ROW EXECUTE FUNCTION fee_history_guard();
--> statement-breakpoint
-- Payments: never deleted; money details never change; voided at most once (D35).
CREATE OR REPLACE FUNCTION fee_payments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'fee payments are never deleted; void the payment instead' USING ERRCODE = 'restrict_violation';
  END IF;
  IF (NEW.id, NEW.tenant_id, NEW.student_id, NEW.receipt_no, NEW.receipt_label, NEW.paid_on, NEW.method, NEW.reference,
      NEW.amount, NEW.remarks, NEW.received_by, NEW.idempotency_key, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.tenant_id, OLD.student_id, OLD.receipt_no, OLD.receipt_label, OLD.paid_on, OLD.method, OLD.reference,
      OLD.amount, OLD.remarks, OLD.received_by, OLD.idempotency_key, OLD.created_at) THEN
    RAISE EXCEPTION 'a fee payment''s amount and details never change' USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status = 'VOID' AND (NEW.status, NEW.voided_at, NEW.voided_by, NEW.void_reason)
     IS DISTINCT FROM (OLD.status, OLD.voided_at, OLD.voided_by, OLD.void_reason) THEN
    RAISE EXCEPTION 'a voided fee payment stays voided' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER fee_payments_guard BEFORE UPDATE OR DELETE ON fee_payments FOR EACH ROW EXECUTE FUNCTION fee_payments_guard();
--> statement-breakpoint
-- At commit, every payment's split across charges adds up exactly to its amount.
CREATE OR REPLACE FUNCTION fee_payment_allocations_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  target uuid;
  expected numeric(14, 2);
  allocated numeric(14, 2);
BEGIN
  IF TG_TABLE_NAME = 'fee_payments' THEN
    target := NEW.id;
  ELSE
    target := NEW.payment_id;
  END IF;
  SELECT p.amount INTO expected FROM fee_payments p WHERE p.id = target;
  SELECT coalesce(sum(a.amount), 0) INTO allocated FROM fee_payment_allocations a WHERE a.payment_id = target;
  IF expected IS DISTINCT FROM allocated THEN
    RAISE EXCEPTION 'a fee payment''s split (%) must add up to its amount (%)', allocated, expected USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER fee_payments_balanced AFTER INSERT ON fee_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fee_payment_allocations_balanced();
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER fee_payment_allocations_balanced AFTER INSERT ON fee_payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fee_payment_allocations_balanced();
