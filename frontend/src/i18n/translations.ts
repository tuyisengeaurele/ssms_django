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
  navDashboard:     { en: 'Dashboard',         fr: 'Tableau de bord',   rw: 'Ikibaho' },
  navFarms:         { en: 'Farms',             fr: 'Fermes',            rw: 'Amahindu' },
  navMyFarms:       { en: 'My Farms',          fr: 'Mes fermes',        rw: 'Amahindu Yanjye' },
  navBatches:       { en: 'Batches',           fr: 'Lots',              rw: 'Amatsinda' },
  navHarvests:      { en: 'Harvests',          fr: 'Récoltes',          rw: 'Isarura' },
  navDetections:    { en: 'Disease AI',        fr: 'Détection IA',      rw: 'Indwara AI' },
  navAlerts:        { en: 'Alerts',            fr: 'Alertes',           rw: 'Ibiburaniswa' },
  navReports:       { en: 'Detection Reports', fr: 'Rapports',          rw: 'Raporo' },
  navDevices:       { en: 'Devices',           fr: 'Appareils',         rw: 'Ibikoresho' },
  navCooperatives:  { en: 'Cooperatives',      fr: 'Coopératives',      rw: 'Amakoperative' },
  navFarmers:       { en: 'Farmers',           fr: 'Agriculteurs',      rw: 'Abahinzi' },
  navOverview:      { en: 'System Overview',   fr: 'Vue d\'ensemble',   rw: 'Incamake' },
  navUserMgmt:      { en: 'User Management',   fr: 'Gestion des users', rw: 'Gucunga Abakoresha' },
  navMessages:      { en: 'Contact Messages',  fr: 'Messages',          rw: 'Ubutumwa' },
  navSettings:      { en: 'Settings',          fr: 'Paramètres',        rw: 'Igenamiterere' },
  navProfile:       { en: 'Profile',           fr: 'Profil',            rw: 'Umwirondoro' },
  navLogout:        { en: 'Sign Out',          fr: 'Se déconnecter',    rw: 'Sohoka' },

  // ── Page titles ─────────────────────────────────────────────────────────────
  pageTitleFarms:        { en: 'Farms',               fr: 'Fermes',                    rw: 'Amahindu' },
  pageTitleBatches:      { en: 'Batches',             fr: 'Lots',                      rw: 'Amatsinda' },
  pageTitleAlerts:       { en: 'Alerts',              fr: 'Alertes',                   rw: 'Ibiburaniswa' },
  pageTitleDetections:   { en: 'Disease Detection',   fr: 'Détection des maladies',    rw: 'Gusuzuma Indwara' },
  pageTitleReports:      { en: 'Detection Reports',   fr: 'Rapports de détection',     rw: 'Raporo za Gusuzuma' },
  pageTitleCooperatives: { en: 'Cooperatives',        fr: 'Coopératives',              rw: 'Amakoperative' },
  pageTitleProfile:      { en: 'My Profile',          fr: 'Mon profil',                rw: 'Umwirondoro Wanjye' },
  pageTitleHarvest:      { en: 'Harvest Records',     fr: 'Relevés de récolte',        rw: "Amakuru y'Isarura" },
  pageTitleDevices:      { en: 'IoT Devices',         fr: 'Appareils IoT',             rw: 'Ibikoresho IoT' },
  pageTitleMessages:     { en: 'Contact Messages',    fr: 'Messages de contact',       rw: 'Ubutumwa bw\'Itumanahana' },

  // ── Buttons / actions ────────────────────────────────────────────────────────
  btnNewFarm:      { en: '+ New Farm',       fr: '+ Nouvelle ferme',        rw: '+ Umuhindu Mushya' },
  btnNewBatch:     { en: '+ New Batch',      fr: '+ Nouveau lot',           rw: '+ Itsinda Rishya' },
  btnAddHarvest:   { en: '+ Add Harvest',    fr: '+ Ajouter une récolte',   rw: '+ Ongeramo Isarura' },
  btnAddDevice:    { en: '+ Add Device',     fr: '+ Ajouter un appareil',   rw: '+ Ongeramo Igikoresho' },
  btnSave:         { en: 'Save',             fr: 'Enregistrer',             rw: 'Bika' },
  btnCancel:       { en: 'Cancel',           fr: 'Annuler',                 rw: 'Reka' },
  btnDelete:       { en: 'Delete',           fr: 'Supprimer',               rw: 'Siba' },
  btnRefresh:      { en: 'Refresh',          fr: 'Actualiser',              rw: 'Vugurura' },
  btnExportCsv:    { en: 'Export CSV',       fr: 'Exporter CSV',            rw: 'Kohereza CSV' },
  btnMarkAllRead:  { en: 'Mark all read',    fr: 'Tout marquer comme lu',   rw: 'Shyira byose nk\'ibirasomwe' },
  btnRunDetection: { en: 'Run Detection',    fr: 'Lancer la détection',     rw: 'Tangira Gusuzuma' },
  btnViewFarm:     { en: 'View farm',        fr: 'Voir la ferme',           rw: 'Reba Umuhindu' },
  btnViewBatch:    { en: 'View batch',       fr: 'Voir le lot',             rw: 'Reba Itsinda' },
  btnSignOut:      { en: 'Sign Out',         fr: 'Se déconnecter',          rw: 'Sohoka' },
  btnMyProfile:    { en: 'My Profile',       fr: 'Mon profil',              rw: 'Umwirondoro Wanjye' },
  btnViewAll:      { en: 'View all alerts',  fr: 'Voir toutes les alertes', rw: 'Reba Ibiburaniswa Byose' },

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
  statusOnline:   { en: 'Online',     fr: 'En ligne',    rw: 'Igikorana' },
  statusOffline:  { en: 'Offline',    fr: 'Hors ligne',  rw: 'Ntiikorana' },
  labelSearch:    { en: 'Search…',    fr: 'Rechercher…', rw: 'Shakisha…' },
  labelNoResults: { en: 'No results', fr: 'Aucun résultat', rw: 'Nta bisubizo' },
  labelAll:       { en: 'All',        fr: 'Tous',        rw: 'Byose' },

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

  // ── Landing page ──────────────────────────────────────────────────────────────
  landingHero:          { en: "Rwanda's Silk Farming, Reimagined",         fr: "L'Agriculture de la Soie au Rwanda, Réinventée",  rw: "Ubuhinzi bw'Hariri mu Rwanda, Bunashywa Bushya" },
  landingSubhero:       { en: 'AI-powered disease detection, real-time IoT monitoring, and smart farm management for sericulture cooperatives.', fr: "Détection des maladies par IA, surveillance IoT en temps réel et gestion intelligente des fermes pour les coopératives séricicoles.", rw: "Gusuzuma indwara hakoreshejwe AI, gukurikirana IoT mu gihe nyacyo, no gucunga amahindu y'amakoperative." },
  landingGetStarted:    { en: 'Get Started Free',       fr: 'Commencer Gratuitement', rw: 'Tangira Ubuntu' },
  landingContactUs:     { en: 'Contact Us',             fr: 'Contactez-nous',         rw: 'Twandikire' },
  landingChallenge:     { en: 'The Challenge',          fr: 'Le Défi',                rw: 'Ikibazo' },
  landingSolution:      { en: 'Our Solution',           fr: 'Notre Solution',         rw: 'Igisubizo Cyacu' },
  landingFeatures:      { en: 'Key Features',           fr: 'Fonctionnalités Clés',   rw: 'Ibintu Bifatika' },
  landingMission:       { en: 'Our Mission',            fr: 'Notre Mission',          rw: 'Intego Yacu' },
  landingGetInTouch:    { en: 'Get in Touch',           fr: 'Prendre Contact',        rw: 'Tuganire' },
  landingFullName:      { en: 'Full Name',              fr: 'Nom complet',            rw: 'Amazina Yombi' },
  landingSubject:       { en: 'Subject',                fr: 'Sujet',                  rw: 'Insanganyamatsiko' },
  landingMessage:       { en: 'Message',                fr: 'Message',                rw: 'Ubutumwa' },
  landingSendMessage:   { en: 'Send Message',           fr: 'Envoyer le message',     rw: 'Ohereza Ubutumwa' },

  // ── Login / Auth pages ────────────────────────────────────────────────────────
  loginWelcome:         { en: 'Welcome back',                           fr: 'Bon retour',                               rw: 'Murakaza neza' },
  loginSubtitle:        { en: 'Sign in to your SSMS account',           fr: 'Connectez-vous à votre compte SSMS',       rw: 'Injira kuri konti yawe ya SSMS' },
  loginEmailLabel:      { en: 'Email address',                          fr: 'Adresse e-mail',                           rw: 'Aderesi ya Imeyili' },
  loginPasswordLabel:   { en: 'Password',                               fr: 'Mot de passe',                             rw: "Ijambo ry'ibanga" },
  loginForgot:          { en: 'Forgot password?',                       fr: 'Mot de passe oublié?',                     rw: "Wibagiwe ijambo ry'ibanga?" },
  loginSignIn:          { en: 'Sign in',                                fr: 'Se connecter',                             rw: 'Injira' },
  loginSigningIn:       { en: 'Signing in…',                            fr: 'Connexion en cours…',                      rw: 'Kwinjira…' },
  loginNoAccount:       { en: "Don't have an account?",                 fr: "Vous n'avez pas de compte?",               rw: 'Nta konti ufite?' },
  loginCreateAccount:   { en: 'Create account',                         fr: 'Créer un compte',                          rw: 'Fungura Konti' },

  // ── Forgot password ───────────────────────────────────────────────────────────
  forgotTitle:          { en: 'Forgot password?',                        fr: 'Mot de passe oublié?',                    rw: "Wibagiwe ijambo ry'ibanga?" },
  forgotDesc:           { en: "Enter your email and we'll send you a secure reset link.", fr: "Entrez votre e-mail et nous vous enverrons un lien de réinitialisation sécurisé.", rw: "Injiza imeyili yawe turaguha urungu rwo gusubiza." },
  forgotSendLink:       { en: 'Send reset link',                         fr: 'Envoyer le lien',                         rw: 'Ohereza urungu' },
  forgotSending:        { en: 'Sending…',                                fr: 'Envoi en cours…',                         rw: 'Kohereza…' },
  forgotCheckInbox:     { en: 'Check your inbox',                        fr: 'Vérifiez votre boîte mail',               rw: 'Reba imeyili yawe' },
  forgotRemember:       { en: 'Remember your password?',                 fr: 'Vous vous souvenez de votre mot de passe?', rw: "Wibuka ijambo ry'ibanga?" },

  // ── Batch detail ──────────────────────────────────────────────────────────────
  batchDetailTitle:     { en: 'Batch Details',       fr: 'Détails du lot',           rw: "Amakuru y'Itsinda" },
  batchLifecycle:       { en: 'Lifecycle Progress',  fr: 'Progression du cycle',     rw: 'Intambwe z\'Ubuzima' },
  batchActivity:        { en: 'Activity Summary',    fr: 'Résumé des activités',     rw: 'Incamake z\'Ibikorwa' },
  batchStartDate:       { en: 'Start Date',          fr: 'Date de début',            rw: 'Itariki yo Gutangira' },
  batchExpectedHarvest: { en: 'Expected Harvest',    fr: 'Récolte prévue',           rw: 'Isarura Ryateguriwe' },
  batchSensorReadings:  { en: 'Recent Sensor Readings', fr: 'Lectures récentes',     rw: 'Amakuru ya Sensors Ashya' },
  batchTemperature:     { en: 'Temperature',         fr: 'Température',              rw: 'Ubushyuhe' },
  batchHumidity:        { en: 'Humidity',            fr: 'Humidité',                 rw: 'Ubunyilyuhe' },
  batchOptimalTemp:     { en: 'Optimal: 22–28 °C',   fr: 'Optimal : 22–28 °C',       rw: 'Byiza: 22–28 °C' },
  batchOptimalHumid:    { en: 'Optimal: 70–85 %',    fr: 'Optimal : 70–85 %',        rw: 'Byiza: 70–85 %' },
  batchArchive:         { en: 'Archive',             fr: 'Archiver',                 rw: 'Bika' },
  batchHarvestRecords:  { en: 'Harvest Records',     fr: 'Relevés de récolte',       rw: "Amakuru y'Isarura" },

  // ── Farm detail ───────────────────────────────────────────────────────────────
  farmEditTitle:        { en: 'Edit Farm',           fr: 'Modifier la ferme',        rw: 'Hindura Umuhindu' },
  farmDeleteTitle:      { en: 'Delete Farm?',        fr: 'Supprimer la ferme?',      rw: 'Siba Umuhindu?' },
  farmNameLabel:        { en: 'Farm Name',           fr: 'Nom de la ferme',          rw: "Izina ry'Umuhindu" },
  farmLocationLabel:    { en: 'Location',            fr: 'Emplacement',              rw: 'Aho Biherereye' },
  farmDevicesTitle:     { en: 'IoT Devices',         fr: 'Appareils IoT',            rw: 'Ibikoresho IoT' },
  farmBatchesTitle:     { en: 'Batches',             fr: 'Lots',                     rw: 'Amatsinda' },
  farmAddDevice:        { en: 'Add Device',          fr: 'Ajouter un appareil',      rw: 'Ongeramo Igikoresho' },
  farmNoDevices:        { en: 'No devices deployed', fr: 'Aucun appareil déployé',   rw: 'Nta bikoresho bihari' },
  farmDeviceName:       { en: 'Device Name',         fr: "Nom de l'appareil",        rw: "Izina ry'Igikoresho" },
  farmDeviceKey:        { en: 'Device Key',          fr: "Clé de l'appareil",        rw: "Urufunguzo rw'Igikoresho" },

  // ── Harvest page ──────────────────────────────────────────────────────────────
  harvestLogRecord:     { en: 'Log Harvest Record',  fr: 'Enregistrer une récolte',  rw: "Shyiraho Amakuru y'Isarura" },
  harvestSaveRecord:    { en: 'Save Record',         fr: "Enregistrer",              rw: 'Bika Amakuru' },
  harvestGradeA:        { en: 'Grade A — Premium',   fr: 'Grade A — Premium',        rw: 'Urwego A — Rwiza cyane' },
  harvestGradeB:        { en: 'Grade B — Standard',  fr: 'Grade B — Standard',       rw: 'Urwego B — Bisanzwe' },
  harvestGradeC:        { en: 'Grade C — Below standard', fr: 'Grade C — Inférieur au standard', rw: 'Urwego C — Hepfo' },
  harvestTotalRecords:  { en: 'Total Records',       fr: 'Total des relevés',        rw: 'Umubare w\'Amakuru' },
  harvestTotalCocoon:   { en: 'Total Cocoon (kg)',   fr: 'Total Cocons (kg)',        rw: 'Imideri Yose (kg)' },
  harvestTotalSilk:     { en: 'Total Silk Yield (g)',fr: 'Total Soie (g)',           rw: 'Umubare w\'Hariri (g)' },
  harvestAvg:           { en: 'Avg per Record',      fr: 'Moyenne par relevé',       rw: 'Rusange kuri Amakuru' },

  // ── Admin dashboard ───────────────────────────────────────────────────────────
  adminTitle:           { en: 'Admin Dashboard',                     fr: 'Tableau de bord Admin',               rw: 'Ikibaho cya Admin' },
  adminSubtitle:        { en: 'Full system oversight and management', fr: 'Surveillance et gestion du système',  rw: 'Gucunga no kugenzura sisitemu' },
  adminTotalFarms:      { en: 'Total Farms',     fr: 'Total des fermes',   rw: 'Amahindu Yose' },
  adminTotalBatches:    { en: 'Total Batches',   fr: 'Total des lots',     rw: 'Amatsinda Yose' },
  adminUniqueFarmers:   { en: 'Unique Farmers',  fr: 'Agriculteurs uniques', rw: 'Abahinzi Batandukanye' },
  adminSystemStatus:    { en: 'System Status',   fr: 'État du système',    rw: 'Imiterere ya Sisitemu' },
  adminQuickActions:    { en: 'Quick Actions',   fr: 'Actions rapides',    rw: 'Ibikorwa Byihuse' },
  adminFarmRegistry:    { en: 'Farm Registry',   fr: 'Registre des fermes', rw: "Inyandiko z'Amahindu" },

  // ── Supervisor dashboard ──────────────────────────────────────────────────────
  supervisorTitle:      { en: 'System Overview',                           fr: 'Vue d\'ensemble du système',             rw: 'Incamake ya Sisitemu' },
  supervisorSubtitle:   { en: 'Real-time farm monitoring & disease intelligence', fr: 'Surveillance en temps réel & détection des maladies', rw: 'Gukurikirana amahindu no gusuzuma indwara' },
  supervisorActiveBatches: { en: 'Active Batches', fr: 'Lots actifs',   rw: 'Amatsinda Akora' },
  supervisorUnreadAlerts:  { en: 'Unread Alerts',  fr: 'Alertes non lues', rw: 'Ibiburaniswa Bitasomwe' },
  supervisorDetections:    { en: 'Total Detections', fr: 'Total détections', rw: 'Gusuzuma Kwose' },
  supervisorLiveAlerts:    { en: 'Live Alerts',    fr: 'Alertes en direct', rw: 'Ibiburaniswa Bizima' },
  supervisorRecentDetections: { en: 'Recent Disease Detections', fr: 'Détections récentes', rw: 'Gusuzuma Indwara Bishya' },
  supervisorSafeTemp:   { en: 'Safe: 22–28 °C',    fr: 'Sûr: 22–28 °C',    rw: 'Byakiriwe: 22–28 °C' },
  supervisorSafeHumid:  { en: 'Safe: 70–85 %',     fr: 'Sûr: 70–85 %',     rw: 'Byakiriwe: 70–85 %' },

  // ── Disease detection page ────────────────────────────────────────────────────
  detectionTitle:       { en: 'Disease Detection',                          fr: 'Détection des maladies',                  rw: 'Gusuzuma Indwara' },
  detectionSubtitle:    { en: 'Upload a silkworm image for AI-powered disease analysis', fr: "Téléchargez une image d'un ver à soie pour une analyse IA", rw: 'Shyiraho ifoto ya umunyabukwe kugirango AI isuzume indwara' },
  detectionUpload:      { en: 'Upload Image',                               fr: "Télécharger l'image",                     rw: 'Ohereza Ifoto' },
  detectionDragDrop:    { en: 'Click or drag an image here',                fr: 'Cliquez ou glissez une image ici',        rw: 'Kanda cyangwa kuzana ifoto hano' },
  detectionFileHint:    { en: 'JPEG · PNG · WebP — max 10 MB',              fr: 'JPEG · PNG · WebP — max 10 Mo',           rw: 'JPEG · PNG · WebP — ntarengwa 10 MB' },
  detectionRunBtn:      { en: 'Run Detection',                              fr: 'Lancer la détection',                     rw: 'Tangira Gusuzuma' },
  detectionRunning:     { en: 'Analysing…',                                 fr: 'Analyse en cours…',                       rw: 'Gusuzuma…' },
  detectionResult:      { en: 'AI Diagnosis',                               fr: 'Diagnostic IA',                           rw: 'Isuzuma rya AI' },
  detectionTestAnother: { en: 'Test Another',                               fr: 'Tester un autre',                         rw: 'Suzuma Ikindi' },
  detectionBackToBatch: { en: 'Back to Batch',                              fr: 'Retour au lot',                           rw: 'Subira ku Tsinda' },
  detectionWarning:     { en: 'Disease detected. Consider isolating this batch.',   fr: 'Maladie détectée. Envisagez d\'isoler ce lot.',  rw: 'Indwara iraboneka. Tekereza gutuza iri tsinda.' },
  detectionOk:          { en: 'No disease detected. Continue normal monitoring.',   fr: 'Aucune maladie détectée. Continuez la surveillance normale.', rw: 'Nta ndwara iraboneka. Komeza gukurikirana bisanzwe.' },
  detectionProbabilities: { en: 'All Class Probabilities',                  fr: 'Toutes les probabilités',                 rw: "Amahirwe Yose y'Amoko" },

  // ── Email verification ────────────────────────────────────────────────────────
  checkEmailTitle:      { en: 'Verify your email',                fr: 'Vérifiez votre email',                   rw: 'Emeza imeyili yawe' },
  checkEmailDesc:       { en: 'One last step before you get started', fr: 'Dernière étape avant de commencer', rw: 'Intambwe imwe ya nyuma' },
  checkEmailHeading:    { en: 'Check your inbox',                 fr: 'Vérifiez votre boîte mail',             rw: 'Reba aho imeyili zigenda' },
  checkEmailSent:       { en: 'We sent a verification link to',   fr: 'Nous avons envoyé un lien à',           rw: 'Twahaye igisomo cy\'imeyili kuri' },
  checkEmailSpam:       { en: "Didn't receive it? Check your spam folder or click below to resend.", fr: "Pas reçu ? Vérifiez les spams ou renvoyez.", rw: "Ntabwo wayikeye? Reba spam cyangwa ongera uhereze." },
  checkEmailNoEmail:    { en: "Didn't get it?",                   fr: "Vous ne l'avez pas reçu ?",             rw: "Ntabwo wayikeye?" },
  checkEmailResend:     { en: 'Resend verification email',        fr: 'Renvoyer le lien',                      rw: 'Ongera uhereze imeyili' },
  checkEmailResending:  { en: 'Sending…',                         fr: 'Envoi en cours…',                       rw: 'Kohereza…' },
  checkEmailResentOk:   { en: 'Verification email resent!',       fr: 'Email de vérification renvoyé !',       rw: 'Imeyili yoherejwe!' },
  checkEmailResendError:{ en: 'Failed to resend. Please try again.', fr: 'Échec de renvoi. Réessayez.',        rw: 'Kohereza byanze. Ongera ugerageze.' },

  verifyEmailVerifying: { en: 'Verifying your email…',            fr: 'Vérification en cours…',                rw: 'Emeza imeyili…' },
  verifyEmailWait:      { en: 'Please wait a moment.',            fr: 'Veuillez patienter.',                   rw: 'Tegereza gato.' },
  verifyEmailSuccess:   { en: 'Email verified!',                  fr: 'Email vérifié !',                       rw: 'Imeyili emejwe!' },
  verifyEmailRedirecting: { en: 'You will be redirected to your dashboard shortly.', fr: 'Vous allez être redirigé vers votre tableau de bord.', rw: 'Uzajyanywa ku kibaho cyawe vuba.' },
  verifyEmailFailed:    { en: 'Verification failed',              fr: 'Échec de vérification',                 rw: 'Kwemeza byanze' },
  verifyEmailExpired:   { en: 'This verification link has expired or is invalid. Please request a new one.', fr: 'Ce lien a expiré ou est invalide.', rw: 'Iri link ryararangiye cyangwa ntirikorana. Saba rishya.' },
  verifyEmailInvalidLink: { en: 'Invalid verification link.',      fr: 'Lien de vérification invalide.',        rw: 'Igisomo cy\'imeyili ntikikorana.' },
  verifyEmailResendLink:{ en: 'Request new link',                  fr: 'Demander un nouveau lien',              rw: 'Saba link rishya' },

  // ── Audit log nav ─────────────────────────────────────────────────────────────
  navAuditLog:      { en: 'Audit Log',           fr: 'Journal d\'audit',        rw: 'Ibitabo by\'Ibikorwa' },
  navSystemReport:  { en: 'System Report',       fr: 'Rapport système',         rw: 'Raporo y\'Uburyo' },

  // ── System report ─────────────────────────────────────────────────────────────
  reportTitle:           { en: 'System Report',              fr: 'Rapport système',                  rw: 'Raporo y\'Uburyo' },
  reportGenerated:       { en: 'Generated at:',              fr: 'Généré le :',                      rw: 'Yakozwe ku :' },
  reportExportPdf:       { en: 'Print / PDF',                fr: 'Imprimer / PDF',                   rw: 'Fata / PDF' },
  reportExportCsv:       { en: 'Export CSV',                 fr: 'Exporter CSV',                     rw: 'Kohereza CSV' },
  reportExporting:       { en: 'Exporting…',                 fr: 'Export en cours…',                 rw: 'Kohereza…' },
  reportTotalUsers:      { en: 'Total Users',                fr: 'Utilisateurs',                     rw: 'Abakoresha Bose' },
  reportTotalFarms:      { en: 'Active Farms',               fr: 'Fermes actives',                   rw: 'Amahindu Akora' },
  reportTotalBatches:    { en: 'Active Batches',             fr: 'Lots actifs',                      rw: 'Amatsinda Akora' },
  reportTotalHarvests:   { en: 'Harvest Records',            fr: 'Relevés de récolte',               rw: "Amakuru y'Isarura" },
  reportTotalDetections: { en: 'Total Detections',           fr: 'Total détections',                 rw: 'Gusuzuma Kwose' },
  reportRegistrations30d:{ en: 'User Registrations (30 d)', fr: 'Inscriptions (30 j)',               rw: 'Kwiyandikisha (iminsi 30)' },
  reportBatchesByStage:  { en: 'Batches by Stage',           fr: 'Lots par stade',                   rw: 'Amatsinda ku Rwego' },
  reportDetections30d:   { en: 'Detections (30 d)',          fr: 'Détections (30 j)',                 rw: 'Gusuzuma (iminsi 30)' },
  reportDetectionResults:{ en: 'Detection Results',          fr: 'Résultats des détections',         rw: 'Ibisubizo bya Gusuzuma' },
  reportHarvestByGrade:  { en: 'Harvest by Grade',           fr: 'Récolte par grade',                rw: 'Isarura ku Grade' },
  reportAuditActions:    { en: 'Audit Actions (30 d)',        fr: 'Actions d\'audit (30 j)',           rw: 'Ibikorwa by\'Audit (iminsi 30)' },
  reportTopFarmers:      { en: 'Top Farmers by Farm Count',  fr: 'Top agriculteurs',                 rw: 'Abahinzi b\'Inzobere' },
  reportTotalCocoonKg:   { en: 'Total Cocoon Weight',        fr: 'Poids total des cocons',           rw: 'Ibiro Byose bya Cocoon' },
  reportTotalSilkG:      { en: 'Total Silk Yield',           fr: 'Production totale de soie',        rw: 'Harira Yose' },
  reportAvgCocoonKg:     { en: 'Avg Cocoon / Record',        fr: 'Moy. cocon / relevé',              rw: 'Maverage ya Cocoon' },
  reportUsersByRole:     { en: 'Users by Role',              fr: 'Utilisateurs par rôle',            rw: 'Abakoresha ku Nshingano' },
};
