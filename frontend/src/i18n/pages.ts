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
} satisfies Record<string, Entry>;

export type PageKey = keyof typeof pageTranslations;
