-- Table: public.lab_assistants

-- DROP TABLE IF EXISTS public.lab_assistants;

CREATE TABLE IF NOT EXISTS public.lab_assistants
(
    user_id bigint NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 9223372036854775807 CACHE 1 ),
    lab_id integer NOT NULL,
    staff_id character varying(50) COLLATE pg_catalog."default" NOT NULL,
    email character varying(255) COLLATE pg_catalog."default" NOT NULL,
    full_name character varying(120) COLLATE pg_catalog."default" NOT NULL,
    password_hash character varying(255) COLLATE pg_catalog."default" NOT NULL,
    phone_number character varying(20) COLLATE pg_catalog."default",
    is_active boolean NOT NULL DEFAULT true,
    failed_login_attempts integer NOT NULL DEFAULT 0,
    locked_until timestamp with time zone,
    last_login_at timestamp with time zone,
    last_login_ip inet,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT lab_assistants_pkey PRIMARY KEY (user_id),
    CONSTRAINT lab_assistants_email_key UNIQUE (email),
    CONSTRAINT lab_assistants_staff_id_key UNIQUE (staff_id),
    CONSTRAINT lab_assistants_lab_id_fkey FOREIGN KEY (lab_id)
        REFERENCES public.labs (lab_id) MATCH SIMPLE
        ON UPDATE NO ACTION
        ON DELETE RESTRICT,
    CONSTRAINT lab_assistants_failed_login_attempts_check CHECK (failed_login_attempts >= 0)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.lab_assistants
    OWNER to rohan;
-- Index: idx_lab_assistants_email

-- DROP INDEX IF EXISTS public.idx_lab_assistants_email;

CREATE INDEX IF NOT EXISTS idx_lab_assistants_email
    ON public.lab_assistants USING btree
    (lower(email::text) COLLATE pg_catalog."default" ASC NULLS LAST)
;
-- Index: idx_lab_assistants_lab_id

-- DROP INDEX IF EXISTS public.idx_lab_assistants_lab_id;

CREATE INDEX IF NOT EXISTS idx_lab_assistants_lab_id
    ON public.lab_assistants USING btree
    (lab_id ASC NULLS LAST)
;
-- Index: idx_lab_assistants_staff_id

-- DROP INDEX IF EXISTS public.idx_lab_assistants_staff_id;

CREATE INDEX IF NOT EXISTS idx_lab_assistants_staff_id
    ON public.lab_assistants USING btree
    (staff_id COLLATE pg_catalog."default" ASC NULLS LAST)
;

-- Trigger: trg_lab_assistants_updated_at

-- DROP TRIGGER IF EXISTS trg_lab_assistants_updated_at ON public.lab_assistants;

CREATE OR REPLACE TRIGGER trg_lab_assistants_updated_at
    BEFORE UPDATE 
    ON public.lab_assistants
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


-- Table: public.labs

-- DROP TABLE IF EXISTS public.labs;

CREATE TABLE IF NOT EXISTS public.labs
(
    lab_id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
    lab_name character varying(100) COLLATE pg_catalog."default" NOT NULL,
    room_number character varying(50) COLLATE pg_catalog."default" NOT NULL,
    capacity integer NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT labs_pkey PRIMARY KEY (lab_id),
    CONSTRAINT labs_lab_name_key UNIQUE (lab_name),
    CONSTRAINT labs_capacity_check CHECK (capacity > 0)
)

TABLESPACE pg_default;

ALTER TABLE IF EXISTS public.labs
    OWNER to rohan;

-- Trigger: trg_labs_updated_at

-- DROP TRIGGER IF EXISTS trg_labs_updated_at ON public.labs;

CREATE OR REPLACE TRIGGER trg_labs_updated_at
    BEFORE UPDATE 
    ON public.labs
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();    