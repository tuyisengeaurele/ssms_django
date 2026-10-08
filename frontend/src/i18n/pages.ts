import type { Locale } from './translations';

type Entry = Record<Locale, string>;
const k = (en: string, fr: string, rw: string): Entry => ({ en, fr, rw });

/** Page titles and section names for the signed in app. Keys start with "pt". */
export const pageTranslations = {
  ptDefault: k('Smart Sericulture Management System', 'Smart Sericulture Management System', 'Smart Sericulture Management System'),

  ptSectionAdmin: k('Administration', 'Administration', 'Ubuyobozi'),
  ptSectionFarming: k('Farming', 'Élevage', 'Ubworozi'),
  ptSectionMonitoring: k('Monitoring', 'Suivi', 'Gukurikirana'),
  ptSectionAccount: k('Account', 'Compte', 'Konti'),

  ptAdmin: k('Admin dashboard', "Tableau de bord de l'administration", "Ikibaho cy'ubuyobozi"),
  ptUsers: k('Users', 'Utilisateurs', 'Abakoresha'),
  ptCooperatives: k('Cooperatives', 'Coopératives', 'Amakoperative'),
  ptMessages: k('Messages', 'Messages', 'Ubutumwa'),
  ptAudit: k('Audit log', "Journal d'audit", "Ibitabo by'ibikorwa"),
  ptSystemReport: k('System report', 'Rapport du système', "Raporo y'uburyo"),

  ptFarmer: k('Dashboard', 'Tableau de bord', 'Ikibaho'),
  ptSupervisor: k('System overview', "Vue d'ensemble", 'Incamake'),
  ptFarms: k('Farms', 'Fermes', 'Amahindu'),
  ptFarmNew: k('New farm', 'Nouvelle ferme', 'Ihinga rishya'),
  ptFarmDetail: k('Farm details', 'Détails de la ferme', "Amakuru y'ihinga"),
  ptBatches: k('Batches', 'Lots', 'Amatsinda'),
  ptBatchNew: k('New batch', 'Nouveau lot', 'Itsinda rishya'),
  ptBatchDetail: k('Batch details', 'Détails du lot', "Amakuru y'itsinda"),
  ptDetect: k('Disease check', 'Contrôle des maladies', 'Gusuzuma indwara'),
  ptHarvest: k('Record a harvest', 'Enregistrer une récolte', 'Andika isarura'),
  ptHarvests: k('Harvests', 'Récoltes', 'Isarura'),
  ptDetectionReports: k('Detection reports', 'Rapports de détection', "Raporo z'isuzuma"),
  ptAlerts: k('Alerts', 'Alertes', 'Ibiburaniswa'),
  ptDevices: k('Devices', 'Appareils', 'Ibikoresho'),
  ptProfile: k('Profile', 'Profil', 'Umwirondoro'),

  // App shell
  navGroupOverview: k('Overview', "Vue d'ensemble", 'Incamake'),
  navGroupPeople: k('People', 'Personnes', 'Abantu'),
  navGroupFarming: k('Farming', 'Élevage', 'Ubworozi'),
  navGroupSystem: k('System', 'Système', 'Sisitemu'),
  navGroupMonitoring: k('Monitoring', 'Suivi', 'Gukurikirana'),
  shellMainMenu: k('Main menu', 'Menu principal', 'Menu nyamukuru'),
  shellOpenMenu: k('Open menu', 'Ouvrir le menu', 'Fungura menu'),
  shellNotifications: k('Notifications', 'Notifications', 'Amatangazo'),
  shellNoAlerts: k('Nothing new. You are all caught up.', 'Rien de nouveau. Vous êtes à jour.', 'Nta gishya. Byose wabibonye.'),
  shellNoMessages: k('No unread messages.', 'Aucun message non lu.', 'Nta butumwa butasomwe.'),
  shellViewAllAlerts: k('View all alerts', 'Voir toutes les alertes', 'Reba ibiburaniswa byose'),
  shellViewAllMessages: k('View all messages', 'Voir tous les messages', 'Reba ubutumwa bwose'),
  shellSignOutAsk: k('Are you sure you want to sign out?', 'Voulez-vous vraiment vous déconnecter ?', 'Wizeye ko ushaka gusohoka?'),
  roleAdmin: k('Administrator', 'Administrateur', 'Umuyobozi'),
  roleSupervisor: k('Supervisor', 'Superviseur', 'Ukurikirana'),
  roleFarmer: k('Farmer', 'Agriculteur', 'Umuhinzi'),

  // Admin dashboard
  adStatFarms: k('Total farms', 'Total des fermes', 'Amahindu yose'),
  adStatFarmsHint: k('registered', 'enregistrées', 'yanditswe'),
  adStatBatches: k('Total batches', 'Total des lots', 'Amatsinda yose'),
  adStatBatchesHint: k('Across all farms', 'Dans toutes les fermes', 'Mu mahindu yose'),
  adStatFarmers: k('Unique farmers', 'Agriculteurs distincts', 'Abahinzi batandukanye'),
  adStatFarmersHint: k('Each owns at least one farm', 'Chacun possède au moins une ferme', 'Buri wese afite nibura ihinga rimwe'),
  adStatAlerts: k('Unread alerts', 'Alertes non lues', 'Ibiburaniswa bitasomwe'),
  adStatAlertsHint: k('Waiting to be read', 'En attente de lecture', 'Bitegereje gusomwa'),
  adQuickActions: k('Quick actions', 'Actions rapides', 'Ibikorwa byihuse'),
  adQaUsers: k('Create accounts, assign roles and manage access.', 'Créez des comptes, attribuez des rôles et gérez les accès.', 'Fungura konti, utange inshingano, ucunge uburenganzira.'),
  adQaDetections: k('Disease history and how often each disease appears.', 'Historique des maladies et fréquence de chacune.', "Amateka y'indwara n'inshuro buri imwe igaragara."),
  adQaOverview: k('Numbers from every farm in one place.', 'Les chiffres de toutes les fermes au même endroit.', "Imibare y'amahindu yose ahantu hamwe."),
  adQaAddFarm: k('Register a new farm in the system.', 'Enregistrez une nouvelle ferme dans le système.', 'Andika ihinga rishya muri sisitemu.'),
  adQaAlerts: k('Review temperature, humidity and disease alerts.', "Consultez les alertes de température, d'humidité et de maladie.", "Reba ibiburaniswa by'ubushyuhe, ubuhehere n'indwara."),
  adQaAudit: k('See who did what, and when.', 'Voyez qui a fait quoi, et quand.', "Reba uwakoze iki, n'igihe."),
  adFarmRegistry: k('Farm registry', 'Registre des fermes', "Inyandiko z'amahindu"),
  adAddFarm: k('Add a farm', 'Ajouter une ferme', 'Ongeraho ihinga'),
  adNoFarms: k('No farms yet', 'Aucune ferme pour le moment', 'Nta hinga rirabaho'),
  adNoFarmsHint: k('Add the first farm to start tracking batches.', 'Ajoutez la première ferme pour suivre les lots.', 'Ongeraho ihinga rya mbere utangire gukurikirana amatsinda.'),
  adLoadFarmsError: k("We couldn't load the farms. Please try again.", "Nous n'avons pas pu charger les fermes. Veuillez réessayer.", 'Ntitwabashije kubona amahindu. Ongera ugerageze.'),
  colFarm: k('Farm', 'Ferme', 'Ihinga'),
  colOwner: k('Owner', 'Propriétaire', 'Nyirubwite'),
  colLocation: k('Location', 'Lieu', 'Aho riherereye'),
  colBatches: k('Batches', 'Lots', 'Amatsinda'),
  btnRetry: k('Try again', 'Réessayer', 'Ongera ugerageze'),
} satisfies Record<string, Entry>;

export type PageKey = keyof typeof pageTranslations;
