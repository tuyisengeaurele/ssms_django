/**
 * SSMS translation strings.
 * Keys are English identifiers. Values are objects with 'en', 'fr', 'rw' fields.
 * Usage: const { t } = useLanguage();  t('navFarms') → 'Farms' / 'Fermes' / 'Amahindu'
 */

export type Locale = 'en' | 'fr' | 'rw';

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  rw: 'Kinyarwanda',
};

type TranslationMap = Record<string, Record<Locale, string>>;

export const translations: TranslationMap = {

  // ── Navigation ──────────────────────────────────────────────────────────────
  navDashboard:    { en: 'Dashboard',      fr: 'Tableau de bord', rw: 'Ikibaho' },
  navFarms:        { en: 'Farms',          fr: 'Fermes',          rw: 'Amahindu' },
  navBatches:      { en: 'Batches',        fr: 'Lots',            rw: 'Amatsinda' },
  navDetections:   { en: 'Disease AI',     fr: 'Détection IA',    rw: 'Indwara AI' },
  navAlerts:       { en: 'Alerts',         fr: 'Alertes',         rw: 'Ibiburaniswa' },
  navReports:      { en: 'Reports',        fr: 'Rapports',        rw: 'Raporo' },
  navCooperatives: { en: 'Cooperatives',   fr: 'Coopératives',    rw: 'Amakoperative' },
  navFarmers:      { en: 'Farmers',        fr: 'Agriculteurs',    rw: 'Abahinzi' },
  navSettings:     { en: 'Settings',       fr: 'Paramètres',      rw: 'Igenamiterere' },
  navProfile:      { en: 'Profile',        fr: 'Profil',          rw: 'Umwirondoro' },
  navLogout:       { en: 'Log out',        fr: 'Se déconnecter',  rw: 'Sohoka' },

  // ── Page titles ─────────────────────────────────────────────────────────────
  pageTitleFarms:        { en: 'Farms',               fr: 'Fermes',                    rw: 'Amahindu' },
  pageTitleBatches:      { en: 'Batches',             fr: 'Lots',                      rw: 'Amatsinda' },
  pageTitleAlerts:       { en: 'Alerts',              fr: 'Alertes',                   rw: 'Ibiburaniswa' },
  pageTitleDetections:   { en: 'Disease Detection',   fr: 'Détection des maladies',    rw: 'Gusuzuma Indwara' },
  pageTitleReports:      { en: 'Detection Reports',   fr: 'Rapports de détection',     rw: 'Raporo za Gusuzuma' },
  pageTitleCooperatives: { en: 'Cooperatives',        fr: 'Coopératives',              rw: 'Amakoperative' },
  pageTitleProfile:      { en: 'My Profile',          fr: 'Mon profil',                rw: 'Umwirondoro Wanjye' },
  pageTitleHarvest:      { en: 'Harvest Records',     fr: 'Relevés de récolte',        rw: "Amakuru y'Isarura" },

  // ── Buttons / actions ────────────────────────────────────────────────────────
  btnNewFarm:      { en: '+ New Farm',       fr: '+ Nouvelle ferme',        rw: '+ Umuhindu Mushya' },
  btnNewBatch:     { en: '+ New Batch',      fr: '+ Nouveau lot',           rw: '+ Itsinda Rishya' },
  btnAddHarvest:   { en: '+ Add Harvest',    fr: '+ Ajouter une récolte',   rw: '+ Ongeramo Isarura' },
  btnSave:         { en: 'Save',             fr: 'Enregistrer',             rw: 'Bika' },
  btnCancel:       { en: 'Cancel',           fr: 'Annuler',                 rw: 'Reka' },
  btnDelete:       { en: 'Delete',           fr: 'Supprimer',               rw: 'Siba' },
  btnExportCsv:    { en: 'Export CSV',       fr: 'Exporter CSV',            rw: 'Kohereza CSV' },
  btnMarkAllRead:  { en: 'Mark all read',    fr: 'Tout marquer comme lu',   rw: 'Shyira byose nk\'ibirasomwe' },
  btnRunDetection: { en: 'Run Detection',    fr: 'Lancer la détection',     rw: 'Tangira Gusuzuma' },
  btnViewFarm:     { en: 'View farm',        fr: 'Voir la ferme',           rw: 'Reba Umuhindu' },
  btnViewBatch:    { en: 'View batch',       fr: 'Voir le lot',             rw: 'Reba Itsinda' },

  // ── Form labels ──────────────────────────────────────────────────────────────
  labelName:           { en: 'Name',             fr: 'Nom',                    rw: 'Izina' },
  labelEmail:          { en: 'Email',            fr: 'E-mail',                 rw: 'Imeyili' },
  labelPassword:       { en: 'Password',         fr: 'Mot de passe',           rw: 'Ijambo ry\'ibanga' },
  labelLocation:       { en: 'Location',         fr: 'Emplacement',            rw: 'Aho biherereye' },
  labelNotes:          { en: 'Notes',            fr: 'Notes',                  rw: 'Ibyanditse' },
  labelCocoonWeight:   { en: 'Cocoon weight (kg)', fr: 'Poids des cocons (kg)', rw: 'Uburemere bw\'imideri (kg)' },
  labelSilkYield:      { en: 'Silk yield (g)',   fr: 'Rendement en soie (g)',  rw: 'Ubushu bw\'hariri (g)' },
  labelQualityGrade:   { en: 'Quality grade',    fr: 'Grade de qualité',       rw: 'Urwego rw\'ubwiza' },
  labelLanguage:       { en: 'Language',         fr: 'Langue',                 rw: 'Ururimi' },
  labelSearchFarms:    { en: 'Search farms…',    fr: 'Rechercher des fermes…', rw: 'Shakisha amahindu…' },
  labelSearchBatches:  { en: 'Search batches…',  fr: 'Rechercher des lots…',   rw: 'Shakisha amatsinda…' },

  // ── Table headers ────────────────────────────────────────────────────────────
  thDate:        { en: 'Date',         fr: 'Date',         rw: 'Itariki' },
  thResult:      { en: 'Result',       fr: 'Résultat',     rw: 'Igisubizo' },
  thConfidence:  { en: 'Confidence',   fr: 'Confiance',    rw: 'Ikizere' },
  thFarm:        { en: 'Farm',         fr: 'Ferme',        rw: 'Umuhindu' },
  thBatch:       { en: 'Batch',        fr: 'Lot',          rw: 'Itsinda' },
  thWeight:      { en: 'Weight (kg)',  fr: 'Poids (kg)',   rw: 'Uburemere (kg)' },
  thGrade:       { en: 'Grade',        fr: 'Grade',        rw: 'Urwego' },
  thActions:     { en: 'Actions',      fr: 'Actions',      rw: 'Ibikorwa' },
  thStage:       { en: 'Stage',        fr: 'Étape',        rw: 'Intambwe' },
  thStatus:      { en: 'Status',       fr: 'Statut',       rw: 'Imiterere' },

  // ── Status / labels ──────────────────────────────────────────────────────────
  statusActive:   { en: 'Active',     fr: 'Actif',       rw: 'Ikorana' },
  statusInactive: { en: 'Inactive',   fr: 'Inactif',     rw: 'Ntiikorana' },
  statusRead:     { en: 'Read',       fr: 'Lu',          rw: 'Byasomwe' },
  statusUnread:   { en: 'Unread',     fr: 'Non lu',      rw: 'Ntibisomwe' },

  // ── Empty states ─────────────────────────────────────────────────────────────
  emptyFarms:      { en: 'No farms yet',          fr: 'Aucune ferme',          rw: 'Nta mahindu' },
  emptyBatches:    { en: 'No batches yet',        fr: 'Aucun lot',             rw: 'Nta matsinda' },
  emptyAlerts:     { en: 'No alerts',             fr: 'Aucune alerte',         rw: 'Nta biburaniswa' },
  emptyDetections: { en: 'No detections yet',     fr: 'Aucune détection',      rw: 'Nta gusuzuma gukorwa' },
  emptyHarvest:    { en: 'No harvest records yet',fr: 'Aucun relevé de récolte', rw: "Nta makuru y'isarura" },

  // ── Misc ─────────────────────────────────────────────────────────────────────
  loading:         { en: 'Loading…',              fr: 'Chargement…',           rw: 'Gutegura…' },
  confirmDelete:   { en: 'Are you sure?',         fr: 'Êtes-vous sûr?',        rw: 'Urafite ubwishingiro?' },
  errorGeneric:    { en: 'Something went wrong',  fr: 'Une erreur est survenue', rw: 'Habayeho ikosa' },
  successSaved:    { en: 'Saved successfully',    fr: 'Enregistré avec succès', rw: 'Byabitswe neza' },
};
