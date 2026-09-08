/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ESPOCRM_API_KEY?: string;
  readonly VITE_ADMIN_PASSWORD?: string;
  readonly VITE_PHOTOS_BASE_URL?: string;

  readonly VITE_INCIDENTS_API_URL?: string;

  readonly VITE_PURCHASE_ORDERS_API_URL?: string;
  readonly VITE_PURCHASE_ORDER_ENTITY?: string;
  readonly VITE_PURCHASE_ORDER_LINES_SUBRESOURCE?: string;
  readonly VITE_PURCHASE_ORDER_TAX_RATE?: string;

  readonly VITE_PURCHASE_REQUESTS_API_URL?: string;
  readonly VITE_PURCHASE_REQUEST_ENTITY?: string;
  readonly VITE_PURCHASE_REQUEST_LINES_SUBRESOURCE?: string;
  readonly VITE_PURCHASE_REQUEST_HISTORY_SUBRESOURCE?: string;

  readonly VITE_PROFORMAS_API_URL?: string;
  readonly VITE_PROFORMA_ENTITY?: string;
  readonly VITE_PROFORMAS_SUBRESOURCE?: string;
  readonly VITE_PROFORMA_LINES_SUBRESOURCE?: string;
  readonly VITE_PROFORMA_TAX_RATE?: string;
  readonly VITE_PROFORMA_EXPIRY_WARNING_DAYS?: string;

  readonly VITE_SUGGESTIONS_API_URL?: string;
  readonly VITE_SUGGESTION_ENTITY?: string;
}
