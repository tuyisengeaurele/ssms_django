import type { Locale } from './translations';

type Entry = Record<Locale, string>;
const k = (en: string, fr: string, rw: string): Entry => ({ en, fr, rw });

/** Copy for the public landing page. Keys start with "lp". */
export const landingTranslations = {
  // Navigation
  lpSkip: k('Skip to content', 'Aller au contenu', 'Simbukira ku bikubiyemo'),
  lpNavProduct: k('Product', 'Produit', 'Porogaramu'),
  lpNavHow: k('How it works', 'Comment ça marche', 'Uko ikora'),
  lpNavContact: k('Contact', 'Contact', 'Twandikire'),
  lpNavLogin: k('Log in', 'Se connecter', 'Injira'),
  lpNavStart: k('Get started', 'Commencer', 'Tangira'),
  lpNavMenu: k('Menu', 'Menu', 'Menu'),
  lpNavClose: k('Close menu', 'Fermer le menu', 'Funga menu'),
  lpLangLabel: k('Language', 'Langue', 'Ururimi'),

  // Hero
  lpHeroTitle: k(
    'Raise healthier silkworms.',
    'Élevez des vers à soie en meilleure santé.',
    "Korora inyo z'ubudodo zifite ubuzima bwiza.",
  ),
  lpHeroSub: k(
    'Watch every batch, catch disease early, harvest at the right time.',
    'Suivez chaque lot, repérez les maladies tôt, récoltez au bon moment.',
    'Kurikirana buri tsinda, menya indwara hakiri kare, usarure igihe cyiza.',
  ),
  lpHeroCta: k('Get started', 'Commencer', 'Tangira'),
  lpHeroSecondary: k('See how it works', 'Voir comment ça marche', 'Reba uko ikora'),
  lpHeroImageAlt: k(
    'Silkworm cocoons resting in bamboo trays',
    'Cocons de vers à soie posés dans des plateaux en bambou',
    "Ibishishwa by'inyo z'ubudodo biri mu bitebo by'imigano",
  ),
  lpGhostWord: k('SILK', 'SILK', 'SILK'),
  lpStat1Value: k('4', '4', '4'),
  lpStat1Label: k(
    'diseases spotted from one photo',
    "maladies repérées à partir d'une photo",
    'indwara zimenyekana ku ifoto imwe',
  ),
  lpStat2Value: k('5', '5', '5'),
  lpStat2Label: k(
    'stages, egg to harvest',
    "étapes, de l'œuf à la récolte",
    'ibyiciro, uhereye ku igi ukageza ku isarura',
  ),
  lpStat3Value: k('3', '3', '3'),
  lpStat3Label: k('languages', 'langues', 'indimi'),
  lpPreviewDashboard: k('Dashboard', 'Tableau de bord', 'Ikibaho'),
  lpPreviewDisease: k('Disease check', 'Détection de maladie', "Isuzuma ry'indwara"),
  lpPreviewAlerts: k('Alerts', 'Alertes', 'Ibiburaniswa'),
  lpSample: k('Sample', 'Exemple', 'Urugero'),

  // Problem
  lpProblem1: k(
    'Silkworms are fragile.',
    'Les vers à soie sont fragiles.',
    "Inyo z'ubudodo ziroroha.",
  ),
  lpProblem2: k(
    'A few degrees, or one damp night, can cost a whole batch.',
    'Quelques degrés, ou une nuit humide, peuvent coûter un lot entier.',
    "Ibyiza bike by'ubushyuhe, cyangwa ijoro rimwe ritose, bishobora gutuma utakaza itsinda ryose.",
  ),
  lpProblem3: k(
    'Checking by hand misses the night.',
    'Un contrôle à la main rate la nuit.',
    "Kugenzura n'intoki ntibibona ijoro.",
  ),

  // How it works
  lpHowTitle: k(
    'From egg to harvest in four steps.',
    "De l'œuf à la récolte en quatre étapes.",
    'Kuva ku igi kugeza ku isarura mu ntambwe enye.',
  ),
  lpStep1Title: k('Register your batch', 'Enregistrez votre lot', 'Andika itsinda ryawe'),
  lpStep1Body: k(
    'Add your farm and start a batch in a minute.',
    'Ajoutez votre ferme et lancez un lot en une minute.',
    'Ongeramo umurima wawe utangire itsinda mu munota umwe.',
  ),
  lpStep2Title: k('Watch the room', 'Surveillez la salle', 'Kurikirana icyumba'),
  lpStep2Body: k(
    'Temperature and humidity update live. Alerts reach you before it is too late.',
    "La température et l'humidité se mettent à jour en direct. Les alertes arrivent avant qu'il ne soit trop tard.",
    "Ubushyuhe n'ubuhehere bihora bihinduka ako kanya. Ibiburaniswa bikugeraho mbere y'uko bitinda.",
  ),
  lpStep3Title: k('Check with a photo', 'Vérifiez avec une photo', 'Isuzume ukoresheje ifoto'),
  lpStep3Body: k(
    'Take a picture of a worm. The model names the disease and how sure it is.',
    'Prenez un ver en photo. Le modèle nomme la maladie et son degré de confiance.',
    "Fata ifoto y'inyo. Porogaramu ivuga indwara n'urugero yizeye.",
  ),
  lpStep4Title: k('Harvest with records', 'Récoltez avec des registres', "Sarura ubike amakuru"),
  lpStep4Body: k(
    'Log weight and grade. Export your records any time.',
    'Notez le poids et la qualité. Exportez vos registres à tout moment.',
    "Andika ibiro n'ubwiza. Ohereza amakuru igihe icyo ari cyo cyose.",
  ),

  // Features
  lpFeaturesTitle: k(
    'Everything a rearing room needs.',
    "Tout ce qu'il faut à une salle d'élevage.",
    "Ibyo icyumba cy'ubworozi gikenera byose.",
  ),
  lpFeat1Title: k('Live readings', 'Mesures en direct', 'Ibipimo bya none'),
  lpFeat1Body: k(
    'Temperature and humidity for every batch.',
    'Température et humidité pour chaque lot.',
    "Ubushyuhe n'ubuhehere bya buri tsinda.",
  ),
  lpFeat2Title: k('Disease check', 'Détection de maladie', "Isuzuma ry'indwara"),
  lpFeat2Body: k(
    'One photo, one answer, with a confidence score.',
    'Une photo, une réponse, avec un score de confiance.',
    "Ifoto imwe, igisubizo kimwe, n'urugero rw'icyizere.",
  ),
  lpFeat3Title: k('Email alerts', 'Alertes par e-mail', 'Ibiburaniswa kuri imeri'),
  lpFeat3Body: k(
    'We write to you when a reading leaves the safe range.',
    'Nous vous écrivons quand une mesure sort de la plage sûre.',
    'Tukwandikira iyo igipimo gisohotse mu rugero rwiza.',
  ),
  lpFeat4Title: k('Cooperatives', 'Coopératives', 'Amakoperative'),
  lpFeat4Body: k(
    'Supervisors follow the farms in their cooperative.',
    'Les superviseurs suivent les fermes de leur coopérative.',
    "Abagenzuzi bakurikirana imirima yo muri koperative yabo.",
  ),
  lpFeat5Title: k('Harvest records', 'Registres de récolte', "Amakuru y'isarura"),
  lpFeat5Body: k(
    'Weight, silk yield and quality grade in one place.',
    'Poids, rendement en soie et qualité au même endroit.',
    "Ibiro, umusaruro w'ubudodo n'ubwiza mu gice kimwe.",
  ),
  lpFeat6Title: k('Three languages', 'Trois langues', 'Indimi eshatu'),
  lpFeat6Body: k(
    'English, French and Kinyarwanda.',
    'Anglais, français et kinyarwanda.',
    "Icyongereza, Igifaransa n'Ikinyarwanda.",
  ),

  // Disease spotlight
  lpSpotTitle: k(
    'Know what is wrong before it spreads.',
    'Sachez ce qui ne va pas avant que cela se propage.',
    "Menya ikibazo mbere y'uko gikwirakwira.",
  ),
  lpSpotBody: k(
    'Upload a photo and see the result on screen.',
    "Envoyez une photo et voyez le résultat à l'écran.",
    'Ohereza ifoto urebe igisubizo kuri ecran.',
  ),
  lpSpotNote: k(
    'A guide, not a replacement for an expert.',
    "Un guide, pas un remplaçant d'expert.",
    "Ni umuyobozi w'inzira, si umusimbura w'inzobere.",
  ),

  // Rwanda
  lpRwandaTitle: k(
    "Built for Rwanda's silk farmers.",
    'Pensé pour les sériciculteurs du Rwanda.',
    "Yakozwe ku bahinzi b'ubudodo bo mu Rwanda.",
  ),
  lpRwandaBody: k(
    'Sericulture lets rural families earn from mulberry and silk. SSMS helps cooperatives keep that work organized and healthy.',
    'La sériciculture permet aux familles rurales de gagner leur vie avec le mûrier et la soie. SSMS aide les coopératives à garder ce travail organisé et en bonne santé.',
    "Ubworozi bw'inyo z'ubudodo butuma imiryango yo mu cyaro yinjiza amafaranga. SSMS ifasha amakoperative gutunganya uwo murimo no kuwugira mwiza.",
  ),

  // FAQ
  lpFaqTitle: k('Questions, answered.', 'Vos questions, nos réponses.', "Ibibazo n'ibisubizo."),
  lpFaq1Q: k(
    'How do readings reach the app?',
    "Comment les mesures arrivent-elles dans l'application ?",
    'Ibipimo bigera gute muri porogaramu?',
  ),
  lpFaq1A: k(
    'A sensor in the rearing room sends temperature and humidity. This version also includes a simulator, so you can try everything without hardware.',
    "Un capteur dans la salle d'élevage envoie la température et l'humidité. Cette version inclut aussi un simulateur, pour tout essayer sans matériel.",
    "Icyuma gipima mu cyumba cy'ubworozi cyohereza ubushyuhe n'ubuhehere. Iyi verisiyo ifite kandi igikoresho cy'igerageza, ushobora kugerageza byose nta byuma.",
  ),
  lpFaq2Q: k(
    'Which diseases can it spot?',
    'Quelles maladies peut-elle repérer ?',
    "Ni izihe ndwara ishobora kumenya?",
  ),
  lpFaq2A: k(
    'Flacherie, Grasserie, Muscardine and Pebrine. It also tells you when a worm looks healthy.',
    'Flacherie, grasserie, muscardine et pébrine. Elle indique aussi quand un ver semble sain.',
    "Flacherie, Grasserie, Muscardine na Pebrine. Inavuga igihe inyo isa nk'ifite ubuzima bwiza.",
  ),
  lpFaq3Q: k(
    'Is the disease check always right?',
    'La détection est-elle toujours juste ?',
    "Isuzuma ry'indwara ahora ryizewe?",
  ),
  lpFaq3A: k(
    'No. It shows how confident it is. Treat it as a guide and ask an extension officer when unsure.',
    'Non. Elle indique son degré de confiance. Prenez-la comme un guide et demandez conseil à un technicien en cas de doute.',
    "Oya. Ivuga urugero yizeye. Uyifate nk'umuyobozi w'inzira, ubaze umugenzuzi w'ubuhinzi igihe ushidikanya.",
  ),
  lpFaq4Q: k(
    'Who can see my farm data?',
    'Qui peut voir les données de ma ferme ?',
    "Ni nde ushobora kubona amakuru y'umurima wanjye?",
  ),
  lpFaq4A: k(
    'You see your own farms. A supervisor sees the farms in their cooperative. Admins manage the system. Our privacy page has the details.',
    'Vous voyez vos fermes. Un superviseur voit les fermes de sa coopérative. Les administrateurs gèrent le système. Notre page de confidentialité donne les détails.',
    "Wowe ubona imirima yawe. Umugenzuzi abona imirima yo muri koperative ye. Abayobozi bacunga sisitemu. Urupapuro rw'ibanga rutanga ibisobanuro.",
  ),
  lpFaq5Q: k('Does it work on a phone?', 'Cela fonctionne-t-il sur téléphone ?', 'Ikora kuri telefone?'),
  lpFaq5A: k(
    'Yes. Open it in your phone browser. It adapts to small screens.',
    "Oui. Ouvrez-le dans le navigateur de votre téléphone. Il s'adapte aux petits écrans.",
    "Yego. Uyifungure muri browser ya telefone yawe. Ihuza n'ecran nto.",
  ),
  lpFaq6Q: k(
    'Which languages are supported?',
    'Quelles langues sont disponibles ?',
    "Ni izihe ndimi zikoreshwa?",
  ),
  lpFaq6A: k(
    'English, French and Kinyarwanda. Switch any time from the top bar.',
    'Anglais, français et kinyarwanda. Changez à tout moment depuis la barre du haut.',
    'Icyongereza, Igifaransa n\'Ikinyarwanda. Hindura igihe icyo ari cyo cyose mu gice cyo hejuru.',
  ),

  // Contact
  lpContactTitle: k('Talk to us.', 'Parlez-nous.', 'Tuvugishe.'),
  lpContactSub: k(
    'Questions, ideas or a cooperative that wants to start. We reply by email.',
    'Des questions, des idées, ou une coopérative qui veut se lancer. Nous répondons par e-mail.',
    'Ibibazo, ibitekerezo cyangwa koperative ishaka gutangira. Tubasubiza kuri imeri.',
  ),
  lpFormName: k('Name', 'Nom', 'Izina'),
  lpFormEmail: k('Email', 'E-mail', 'Imeri'),
  lpFormSubject: k('Subject', 'Objet', 'Impamvu'),
  lpFormMessage: k('Message', 'Message', 'Ubutumwa'),
  lpFormSend: k('Send message', 'Envoyer le message', 'Ohereza ubutumwa'),
  lpFormSending: k('Sending', 'Envoi en cours', 'Birimo koherezwa'),
  lpFormSentTitle: k('Message received.', 'Message reçu.', 'Ubutumwa bwakiriwe.'),
  lpFormSentBody: k(
    'We sent a confirmation to {email}. We will reply soon.',
    'Nous avons envoyé une confirmation à {email}. Nous répondrons bientôt.',
    'Twohereje ubwemeza kuri {email}. Turagusubiza vuba.',
  ),
  lpFormErrorGeneric: k(
    'Could not send your message. Please try again.',
    "Impossible d'envoyer votre message. Réessayez.",
    'Ubutumwa bwawe ntibwoherejwe. Ongera ugerageze.',
  ),
  lpFormErrorNetwork: k(
    'No connection. Check your network and try again.',
    'Pas de connexion. Vérifiez votre réseau et réessayez.',
    'Nta murongo. Reba umuyoboro wawe ongera ugerageze.',
  ),
  lpFormErrorBusy: k(
    'Too many messages. Please wait a bit.',
    'Trop de messages. Patientez un peu.',
    'Ubutumwa ni bwinshi. Tegereza gato.',
  ),
  lpFormRequired: k('This field is required.', 'Ce champ est obligatoire.', 'Iki gice ni ngombwa.'),
  lpFormEmailInvalid: k(
    'Enter a valid email address.',
    'Saisissez une adresse e-mail valide.',
    'Andika imeri yemewe.',
  ),
  lpFormMessageShort: k(
    'Write at least 10 characters.',
    'Écrivez au moins 10 caractères.',
    'Andika nibura inyuguti 10.',
  ),

  // Final call to action and footer
  lpCtaTitle: k(
    'Ready to raise healthier silkworms?',
    'Prêt à élever des vers à soie en meilleure santé ?',
    "Witeguye korora inyo z'ubudodo zifite ubuzima bwiza?",
  ),
  lpCtaButton: k('Get started', 'Commencer', 'Tangira'),
  lpFooterName: k(
    'Smart Sericulture Management System',
    'Smart Sericulture Management System',
    'Smart Sericulture Management System',
  ),
  lpFooterTagline: k('Built in Rwanda.', 'Conçu au Rwanda.', 'Byakorewe mu Rwanda.'),
  lpFooterPrivacy: k('Privacy', 'Confidentialité', 'Ibanga'),
  lpFooterTerms: k('Terms', 'Conditions', 'Amabwiriza'),
  lpFooterPhotos: k('Photos from Pexels.', 'Photos de Pexels.', 'Amafoto aturuka kuri Pexels.'),

  // Sample content inside the product mockups
  lpMockToday: k('Today', "Aujourd'hui", 'Uyu munsi'),
  lpMockBatch: k('Batch', 'Lot', 'Itsinda'),
  lpMockTemperature: k('Temperature', 'Température', 'Ubushyuhe'),
  lpMockHumidity: k('Humidity', 'Humidité', 'Ubuhehere'),
  lpMockInRange: k('In range', 'Dans la plage', 'Mu rugero'),
  lpMockHarvestTitle: k('Harvest records', 'Registres de récolte', "Amakuru y'isarura"),
  lpMockWeight: k('Weight', 'Poids', 'Ibiro'),
  lpMockGrade: k('Grade', 'Qualité', 'Ubwiza'),
  lpMockConfidence: k('Confidence', 'Confiance', 'Icyizere'),
  lpMockResult: k('Result', 'Résultat', 'Igisubizo'),
  lpMockAlert1: k(
    'Temperature too high on Batch B',
    'Température trop élevée sur le lot B',
    'Ubushyuhe ni bwinshi mu itsinda B',
  ),
  lpMockAlert2: k('Humidity low on Batch C', 'Humidité basse sur le lot C', 'Ubuhehere ni buke mu itsinda C'),
  lpMockAlert3: k('Batch A moved to Pupa', 'Le lot A est passé au stade Pupa', 'Itsinda A ryageze ku cyiciro cya Pupa'),
  lpMockAgo1: k('2 min ago', 'Il y a 2 min', 'Hashize iminota 2'),
  lpMockAgo2: k('40 min ago', 'Il y a 40 min', 'Hashize iminota 40'),
  lpMockAgo3: k('Yesterday', 'Hier', 'Ejo hashize'),
  lpMockAriaDashboard: k(
    'Sample dashboard showing three batches with temperature and humidity',
    'Exemple de tableau de bord avec trois lots, leur température et leur humidité',
    "Urugero rw'ikibaho rufite amatsinda atatu, ubushyuhe n'ubuhehere",
  ),
  lpMockAriaHarvest: k(
    'Sample harvest records table with weight and grade',
    'Exemple de tableau de registres de récolte avec poids et qualité',
    "Urugero rw'imbonerahamwe y'amakuru y'isarura, ibiro n'ubwiza",
  ),
  lpMockAriaDisease: k(
    'Sample disease check result with confidence bars',
    'Exemple de résultat de détection de maladie avec barres de confiance',
    "Urugero rw'igisubizo cy'isuzuma ry'indwara n'imirongo y'icyizere",
  ),
  lpMockAriaAlerts: k(
    'Sample list of three alerts',
    'Exemple de liste de trois alertes',
    "Urugero rw'urutonde rw'ibiburaniswa bitatu",
  ),
} satisfies Record<string, Entry>;

export type LandingKey = keyof typeof landingTranslations;
export const LANDING_KEYS = Object.keys(landingTranslations) as LandingKey[];
