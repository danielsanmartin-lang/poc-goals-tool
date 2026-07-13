// Constantes de dominio (casos de uso, pre-check, hitos de timeline).
// Sin estado: solo definiciones. El texto EN/ES lo resuelve i18n.pick().

export const USE_CASES = [
  { id: 'uc_aware', en: 'Security Awareness',    es: 'Concienciación en Seguridad' },
  { id: 'uc_phish', en: 'Phishing Simulation',   es: 'Simulación de Phishing' },
  { id: 'uc_vish',  en: 'Vishing',               es: 'Vishing' },
  { id: 'uc_smish', en: 'Smishing',              es: 'Smishing' },
  { id: 'uc_exec',  en: 'Executive Reporting',   es: 'Informes para Dirección' },
  { id: 'uc_comp',  en: 'Compliance',            es: 'Cumplimiento Normativo' },
  { id: 'uc_risk',  en: 'Risk Identification',   es: 'Identificación de Riesgos' },
  { id: 'uc_behav', en: 'Employee Behaviour',    es: 'Comportamiento del Empleado' },
  { id: 'uc_train', en: 'Training Completion',   es: 'Completación de Formación' },
];

export const CHECKS = [
  {
    id: 'pc_wl',
    en: 'Whitelisting completed',
    es: 'Whitelisting completado',
    risk_en: 'If not done: simulations will not reach users — the PoC cannot launch.',
    risk_es: 'Si no se hace: las simulaciones no llegarán a los usuarios y la PoC no podrá lanzarse.',
  },
  {
    id: 'pc_csv',
    en: 'CSV of users uploaded to the platform',
    es: 'CSV de usuarios subido a la plataforma',
    risk_en: 'If not done: no target list available — simulations cannot be configured or sent.',
    risk_es: 'Si no se hace: sin lista de destinatarios, las simulaciones no pueden configurarse ni enviarse.',
  },
  {
    id: 'pc_users',
    en: 'Users identified and confirmed by the customer',
    es: 'Usuarios identificados y confirmados por el cliente',
    risk_en: 'If not done: wrong or incomplete audience — results will not be representative.',
    risk_es: 'Si no se hace: audiencia incorrecta o incompleta — los resultados no serán representativos.',
  },
  {
    id: 'pc_admin',
    en: 'Customer admin user created and has platform access',
    es: 'Usuario administrador del cliente creado y con acceso a la plataforma',
    risk_en: 'If not done: customer cannot monitor the PoC or validate results independently.',
    risk_es: 'Si no se hace: el cliente no puede monitorizar la PoC ni validar resultados de forma independiente.',
  },
  {
    id: 'pc_scenarios',
    en: 'Simulation scenarios reviewed and aligned to customer context',
    es: 'Escenarios de simulación revisados y alineados al contexto del cliente',
    risk_en: 'If not done: scenarios may feel irrelevant — reducing engagement and credibility of results.',
    risk_es: 'Si no se hace: los escenarios pueden parecer irrelevantes, reduciendo la credibilidad de los resultados.',
  },
  {
    id: 'pc_closing',
    en: 'PoC closing meeting scheduled with executive sponsor',
    es: 'Reunión de cierre de la PoC programada con el sponsor ejecutivo',
    risk_en: 'If not done: no formal close — results review may be delayed or skipped entirely.',
    risk_es: 'Si no se hace: sin cierre formal, la revisión de resultados puede retrasarse o no producirse.',
  },
];

export const TIMELINE = [
  { label: { en: 'Kickoff',         es: 'Kick-off' },          ph: { en: 'Kickoff · Whitelisting confirmed · Agreement completed', es: 'Kick-off · Whitelisting confirmado · Acuerdo completado' } },
  { label: { en: 'Launch',          es: 'Lanzamiento' },       ph: { en: 'Simulations launched — delivery confirmed',              es: 'Simulaciones lanzadas — entrega confirmada' } },
  { label: { en: 'Check-in',        es: 'Check-in' },          ph: { en: 'Check-in call — early results reviewed',                 es: 'Check-in — primeros resultados revisados' } },
  { label: { en: 'Closing meeting', es: 'Reunión de cierre' }, ph: { en: 'PoC closing meeting — use cases validated',              es: 'Reunión de cierre — casos de uso validados' } },
  { label: { en: 'Next step',       es: 'Siguiente paso' },    ph: { en: 'Negotiation / extend / close',                          es: 'Negociación / extender / cerrar' } },
];

// Estados de la POC (Borrador / En curso / Finalizado / Extendido)
export const STATUSES = [
  { id: 'draft',       en: 'Draft',       es: 'Borrador' },
  { id: 'in_progress', en: 'In progress', es: 'En curso' },
  { id: 'finished',    en: 'Finished',    es: 'Finalizado' },
  { id: 'extended',    en: 'Extended',    es: 'Extendido' },
];

// Puesto del usuario (perfil). Orden alfabético + "Otro" (texto libre) al final.
// El valor almacenado en profiles.job_title es el string tal cual; si no está en
// esta lista, la UI lo trata como "Otro" y muestra el texto guardado.
export const JOB_TITLES = [
  'Account Executive - Enterprise',
  'Account Executive - Mid-Market',
  'Channel Account Manager',
  'Channel Director',
  'RevOps Manager',
  'Sales Director',
  'Sales Manager',
];
export const JOB_TITLE_OTHER = '__other__';

// Departamento del usuario (perfil).
export const DEPARTMENTS = [
  { id: 'sales',    en: 'Sales',    es: 'Sales' },
  { id: 'partners', en: 'Partners', es: 'Partners' },
];
