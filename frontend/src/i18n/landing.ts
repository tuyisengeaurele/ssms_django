import type { Locale } from './translations';

type Entry = Record<Locale, string>;
const k = (en: string, fr: string, rw: string): Entry => ({ en, fr, rw });

/** Copy for the public landing page. Keys start with "lp". */
export const landingTranslations = {
  // Navigation
  lpSkip: k('Skip to content', 'Aller au contenu', 'Simbukira ku bikubiyemo'),
  lpNavAbout: k('Sericulture', 'Sériciculture', "Ubworozi bw'inyo"),
  lpNavProduct: k('What it does', 'Ce que ça fait', 'Ibyo ikora'),
  lpNavHow: k('How it works', 'Comment ça marche', 'Uko ikora'),
  lpNavFaq: k('FAQ', 'FAQ', 'Ibibazo'),
  lpNavContact: k('Contact', 'Contact', 'Twandikire'),
  lpNavLogin: k('Log in', 'Se connecter', 'Injira'),
  lpNavStart: k('Create account', 'Créer un compte', 'Fungura konti'),
  lpNavMenu: k('Menu', 'Menu', 'Menu'),
  lpNavClose: k('Close menu', 'Fermer le menu', 'Funga menu'),
  lpLangLabel: k('Language', 'Langue', 'Ururimi'),

  // Hero
  lpHeroEyebrow: k(
    "Smart Sericulture Management System",
    "Smart Sericulture Management System",
    "Smart Sericulture Management System",
  ),
  lpHeroTitle: k(
    'Raise healthier silkworms.',
    'Élevez des vers à soie en meilleure santé.',
    "Korora inyo z'ubudodo zifite ubuzima bwiza.",
  ),
  lpHeroSub: k(
    'SSMS watches the temperature and humidity in your rearing room, checks worms for disease from a photo, and keeps your batch records. You see trouble while you can still fix it.',
    "SSMS surveille la température et l'humidité de votre salle d'élevage, repère les maladies à partir d'une photo et tient vos registres de lots. Vous voyez le problème tant qu'il est encore temps d'agir.",
    "SSMS ikurikirana ubushyuhe n'ubuhehere mu cyumba cyawe, igasuzuma indwara ikoresheje ifoto, ikabika amakuru y'amatsinda yawe. Ubona ikibazo hakiri igihe cyo kugikemura.",
  ),
  lpHeroCta: k('Create your account', 'Créer votre compte', 'Fungura konti yawe'),
  lpHeroSecondary: k('See how it works', 'Voir comment ça marche', 'Reba uko ikora'),
  lpHeroImageAlt: k(
    'Silkworm cocoons resting in bamboo trays',
    'Cocons de vers à soie posés dans des plateaux en bambou',
    "Ibishishwa by'inyo z'ubudodo biri mu bitebo by'imigano",
  ),
  // Paper cards
  lpCardReport: k('Batch report', 'Rapport de lot', "Raporo y'itsinda"),
  lpCardBatch: k('Batch', 'Lot', 'Itsinda'),
  lpCardStage: k('Stage', 'Stade', 'Icyiciro'),
  lpCardTemp: k('Temperature', 'Température', 'Ubushyuhe'),
  lpCardHumidity: k('Humidity', 'Humidité', 'Ubuhehere'),
  lpCardSafe: k('Safe range', 'Plage sûre', 'Urugero rwiza'),
  lpCardHarvestIn: k('Harvest in', 'Récolte dans', "Isarura mu"),
  lpCardInRange: k('Within range', 'Dans la plage', 'Mu rugero'),
  lpCardRange: k('22 to 28 °C', '22 à 28 °C', '22 kugeza 28 °C'),
  lpMockInDays: k('in 28 days', 'dans 28 jours', 'mu minsi 28'),
  lpMockTotal: k('Total', 'Total', 'Yose hamwe'),
  lpMockAttention: k('Needs a look', 'À vérifier', 'Bisaba kurebwa'),
  lpMockStatus: k('Status', 'État', 'Imimerere'),
  lpCardDays: k('12 days', '12 jours', 'minsi 12'),
  lpCardDisease: k('Disease check', 'Détection de maladie', "Isuzuma ry'indwara"),
  lpCardResult: k('Result', 'Résultat', 'Igisubizo'),
  lpCardConfidence: k('Confidence', 'Confiance', 'Icyizere'),
  lpCardHealthy: k('Healthy', 'Sain', 'Nzima'),

  // Screens shown while scrolling "how it works"
  lpMockNewBatch: k('New batch', 'Nouveau lot', 'Itsinda rishya'),
  lpMockFarm: k('Farm', 'Ferme', 'Umurima'),
  lpMockStartDate: k('Start date', 'Date de début', "Itariki yo gutangira"),
  lpMockExpected: k('Expected harvest', 'Récolte prévue', "Isarura ryitezwe"),
  lpMockCreate: k('Create batch', 'Créer le lot', 'Kora itsinda'),
  lpMockReadings: k('Room readings', 'Mesures de la salle', 'Ibipimo by’icyumba'),
  lpMockNow: k('Now', 'Maintenant', 'Ubu'),
  lpMockLast24: k('Last 24 hours', '24 dernières heures', 'Amasaha 24 ashize'),
  lpMockBatch: k('Batch', 'Lot', 'Itsinda'),
  lpMockWeight: k('Weight', 'Poids', 'Ibiro'),
  lpMockGrade: k('Grade', 'Qualité', 'Ubwiza'),
  lpMockYield: k('Silk yield', 'Rendement en soie', "Umusaruro w'ubudodo"),
  lpMockHarvestTitle: k('Harvest records', 'Registres de récolte', "Amakuru y'isarura"),
  lpMockAlert1: k(
    'Temperature too high on Batch B',
    'Température trop élevée sur le lot B',
    'Ubushyuhe ni bwinshi mu itsinda B',
  ),
  lpMockAgo1: k('2 min ago', 'Il y a 2 min', 'Hashize iminota 2'),
  lpAriaReport: k(
    'Illustration of a batch report with stage, temperature and humidity',
    'Illustration d’un rapport de lot avec le stade, la température et l’humidité',
    "Ishusho ya raporo y'itsinda ifite icyiciro, ubushyuhe n'ubuhehere",
  ),
  lpAriaNewBatch: k(
    'Illustration of the new batch form',
    'Illustration du formulaire de nouveau lot',
    "Ishusho y'urupapuro rw'itsinda rishya",
  ),
  lpAriaReadings: k(
    'Illustration of room readings over the last 24 hours',
    'Illustration des mesures de la salle sur les 24 dernières heures',
    "Ishusho y'ibipimo by'icyumba mu masaha 24 ashize",
  ),
  lpAriaDisease: k(
    'Illustration of a disease check result with confidence scores',
    'Illustration d’un résultat de détection de maladie avec des scores de confiance',
    "Ishusho y'igisubizo cy'isuzuma ry'indwara n'urugero rw'icyizere",
  ),
  lpAriaHarvest: k(
    'Illustration of harvest records with weight and grade',
    'Illustration de registres de récolte avec poids et qualité',
    "Ishusho y'amakuru y'isarura, ibiro n'ubwiza",
  ),

  // About sericulture
  lpAboutEyebrow: k('Sericulture', 'Sériciculture', "Ubworozi bw'inyo z'ubudodo"),
  lpAboutTitle: k(
    "Sericulture turns mulberry leaves into silk.",
    "La sériciculture transforme les feuilles de mûrier en soie.",
    "Ubworozi bw'inyo z'ubudodo buhindura amababi ya mulberry ubudodo.",
  ),
  lpAboutBody1: k(
    "Sericulture is silk farming. Silkworms eat mulberry leaves for a few weeks, then each one spins a cocoon. The cocoon is reeled into silk thread.",
    "La sériciculture est l'élevage du ver à soie. Pendant quelques semaines, les vers mangent des feuilles de mûrier, puis chacun file un cocon. Le cocon est dévidé en fil de soie.",
    "Ubworozi bw'inyo z'ubudodo ni ugukora ubudodo. Inyo ziryaho amababi ya mulberry mu byumweru bike, hanyuma buri nyo igakora igishishwa. Igishishwa kigahindurwa umugozi w'ubudodo.",
  ),
  lpAboutBody2: k(
    "Every batch passes through five stages, from egg to harvest. Each stage has its own needs, and a mistake in one shows up in the next.",
    "Chaque lot passe par cinq stades, de l'œuf à la récolte. Chaque stade a ses besoins, et une erreur à l'un se voit au suivant.",
    "Buri tsinda ritambuka ibyiciro bitanu, kuva ku igi kugeza ku isarura. Buri cyiciro gifite ibyo gikenera, kandi ikosa mu cyiciro kimwe rigaragara mu gikurikiyeho.",
  ),
  lpAboutBody3: k(
    "SSMS is built for Rwandan farmers and cooperatives who want to raise silk with confidence.",
    "SSMS est conçu pour les agriculteurs et les coopératives du Rwanda qui veulent élever la soie en toute confiance.",
    "SSMS yakorewe abahinzi n'amakoperative byo mu Rwanda bashaka korora ubudodo bafite icyizere.",
  ),
  lpStagesLabel: k('The five stages of a batch', "Les cinq stades d'un lot", "Ibyiciro bitanu by'itsinda"),
  lpStage1: k('Egg', 'Œuf', 'Igi'),
  lpStage2: k('Larva', 'Larve', 'Larva'),
  lpStage3: k('Pupa', 'Pupe', 'Pupa'),
  lpStage4: k('Cocoon', 'Cocon', 'Igishishwa'),
  lpStage5: k('Harvest', 'Récolte', 'Isarura'),

  // The challenge
  lpChallengeEyebrow: k('The challenge', 'Le défi', 'Ikibazo'),
  lpChallengeTitle: k(
    "A small change in the room can cost you a batch.",
    "Un petit changement dans la salle peut vous coûter un lot.",
    "Impinduka nto mu cyumba zishobora kugutwara itsinda.",
  ),
  lpChallengeIntro: k(
    'Silkworms are sensitive to heat, damp and disease, and a rearing room is hard to watch around the clock.',
    "Les vers à soie sont sensibles à la chaleur, à l'humidité et aux maladies, et une salle d'élevage est difficile à surveiller jour et nuit.",
    "Inyo z'ubudodo zumva ubushyuhe, ubuhehere n'indwara vuba, kandi icyumba cy'ubworozi biragoye kugikurikirana amanywa n'ijoro.",
  ),
  lpChallenge1Title: k('Conditions drift', 'Les conditions dérivent', 'Ibihe birahinduka'),
  lpChallenge1Body: k(
    'A hot afternoon or a damp night can pass while nobody is in the room.',
    "Un après-midi chaud ou une nuit humide peut passer sans que personne soit dans la salle.",
    'Ikirere gishyushye cyangwa ijoro ritose bishobora kurenga nta muntu uri mu cyumba.',
  ),
  lpChallenge2Title: k('Disease goes unnoticed', 'La maladie passe inaperçue', 'Indwara ntibonwa'),
  lpChallenge2Body: k(
    'Early signs of silkworm disease are easy to miss. By the time a tray looks sick, the disease has spread.',
    "Les premiers signes de maladie sont faciles à manquer. Quand un plateau semble malade, la maladie s'est déjà propagée.",
    "Ibimenyetso bya mbere by'indwara biroroshye kubirengagiza. Iyo itsinda risa n'iririmo indwara, iba yamaze gukwirakwira.",
  ),
  lpChallenge3Title: k('Records stay on paper', 'Les registres restent sur papier', 'Amakuru aguma ku mpapuro'),
  lpChallenge3Body: k(
    'Weights, dates and grades sit in notebooks. A cooperative cannot compare farms or plan the next cycle from them.',
    "Poids, dates et qualités dorment dans des cahiers. Une coopérative ne peut ni comparer les fermes ni préparer le cycle suivant avec eux.",
    "Ibiro, amatariki n'ubwiza biri mu madaftari. Koperative ntishobora kugereranya imirima cyangwa gutegura igihe gikurikiyeho.",
  ),

  // What SSMS does
  lpSolutionEyebrow: k('What SSMS does', 'Ce que fait SSMS', 'Ibyo SSMS ikora'),
  lpSolutionTitle: k(
    'A second pair of eyes for every rearing room.',
    "Une deuxième paire d'yeux pour chaque salle d'élevage.",
    "Ijisho rya kabiri ku cyumba cy'ubworozi cyose.",
  ),
  lpFeat1Title: k('Live readings', 'Mesures en direct', 'Ibipimo bya none'),
  lpFeat1Body: k(
    'Sensors in the room send temperature and humidity. You read them on your phone from anywhere.',
    "Des capteurs dans la salle envoient la température et l'humidité. Vous les lisez sur votre téléphone, où que vous soyez.",
    "Ibyuma biri mu cyumba byohereza ubushyuhe n'ubuhehere. Ubisoma kuri telefone aho uri hose.",
  ),
  lpFeat2Title: k('Disease check', 'Détection de maladie', "Isuzuma ry'indwara"),
  lpFeat2Body: k(
    'Photograph a worm. The platform names the disease it sees and shows how confident it is.',
    "Photographiez un ver. La plateforme nomme la maladie qu'elle identifie et indique son degré de confiance.",
    "Fata ifoto y'inyo. Porogaramu ivuga indwara ibonye n'urugero yizeye.",
  ),
  lpFeat3Title: k('Email alerts', 'Alertes par e-mail', 'Ibiburaniswa kuri imeri'),
  lpFeat3Body: k(
    'When a reading leaves the safe range, you get an email.',
    'Quand une mesure sort de la plage sûre, vous recevez un e-mail.',
    'Iyo igipimo gisohotse mu rugero rwiza, wohererezwa imeri.',
  ),
  lpFeat4Title: k('Harvest records', 'Registres de récolte', "Amakuru y'isarura"),
  lpFeat4Body: k(
    'Weight, silk yield and quality grade stay with the batch, ready to export.',
    'Poids, rendement en soie et qualité restent avec le lot, prêts à exporter.',
    "Ibiro, umusaruro w'ubudodo n'ubwiza bibikwa mu itsinda, byiteguye koherezwa.",
  ),
  lpFeat5Title: k('Cooperatives', 'Coopératives', 'Amakoperative'),
  lpFeat5Body: k(
    'Supervisors follow every farm in their cooperative and spot the ones that need help.',
    "Les superviseurs suivent chaque ferme de leur coopérative et repèrent celles qui ont besoin d'aide.",
    "Abagenzuzi bakurikirana buri murima wo muri koperative yabo bakabona abakeneye ubufasha.",
  ),

  // How it works
  lpHowEyebrow: k('How it works', 'Comment ça marche', 'Uko ikora'),
  lpHowTitle: k(
    'From egg to harvest in four steps.',
    "De l'œuf à la récolte en quatre étapes.",
    'Kuva ku igi kugeza ku isarura mu ntambwe enye.',
  ),
  lpStep1Title: k('Register your batch', 'Enregistrez votre lot', 'Andika itsinda ryawe'),
  lpStep1Body: k(
    'Add your farm and start a batch. It takes about a minute.',
    'Ajoutez votre ferme et lancez un lot. Cela prend environ une minute.',
    'Ongeramo umurima wawe utangire itsinda. Bifata nk’umunota umwe.',
  ),
  lpStep2Title: k('Watch the room', 'Surveillez la salle', 'Kurikirana icyumba'),
  lpStep2Body: k(
    'Temperature and humidity show on your phone. If they leave the safe range, you get an email.',
    "La température et l'humidité s'affichent sur votre téléphone. Si elles sortent de la plage sûre, vous recevez un e-mail.",
    "Ubushyuhe n'ubuhehere bigaragara kuri telefone yawe. Nibisohoka mu rugero rwiza, wohererezwa imeri.",
  ),
  lpStep3Title: k('Check with a photo', 'Vérifiez avec une photo', 'Isuzume ukoresheje ifoto'),
  lpStep3Body: k(
    'Take a picture of a worm. The platform names the disease and shows how confident it is.',
    "Prenez un ver en photo. La plateforme nomme la maladie et indique son degré de confiance.",
    "Fata ifoto y'inyo. Porogaramu ivuga indwara n'urugero yizeye.",
  ),
  lpStep4Title: k('Harvest with records', 'Récoltez avec des registres', 'Sarura ubike amakuru'),
  lpStep4Body: k(
    'Log the weight and grade. Export your records whenever you need them.',
    'Notez le poids et la qualité. Exportez vos registres quand vous en avez besoin.',
    "Andika ibiro n'ubwiza. Ohereza amakuru igihe cyose ubikeneye.",
  ),

  // Disease check
  lpSpotEyebrow: k('Disease check', 'Détection de maladie', "Isuzuma ry'indwara"),
  lpSpotTitle: k(
    'Catch disease while you can still act.',
    "Repérez la maladie tant qu'il est temps d'agir.",
    'Menya indwara hakiri igihe cyo kugira icyo ukora.',
  ),
  lpSpotBody: k(
    'Upload a photo of a worm. The platform names the disease it identifies and shows a confidence score for each option.',
    "Envoyez une photo d'un ver. La plateforme nomme la maladie qu'elle identifie et affiche un score de confiance pour chaque possibilité.",
    "Ohereza ifoto y'inyo. Porogaramu ivuga indwara imenye kandi ikerekana urugero rw'icyizere kuri buri bushobozi.",
  ),
  lpSpotNote: k(
    'Like any AI tool, it can make mistakes. Treat the result as a fast second opinion and check big decisions with an extension officer.',
    "Comme tout outil d'IA, elle peut se tromper. Prenez le résultat comme un avis rapide et vérifiez les grandes décisions avec un technicien agricole.",
    "Nk'igikoresho cyose cya AI, gishobora kwibeshya. Fata igisubizo nk'igitekerezo cya kabiri cyihuse, kandi ibyemezo bikomeye ubirebe n'umugenzuzi w'ubuhinzi.",
  ),

  // Cooperatives
  lpCoopEyebrow: k('Cooperatives', 'Coopératives', 'Amakoperative'),
  lpCoopTitle: k('One view of every farm.', 'Une vue de chaque ferme.', 'Ishusho imwe ya buri murima.'),
  lpCoopBody: k(
    'A cooperative supervisor sees the farms in their group, opens any batch and spots trouble early. Admins manage accounts and cooperatives.',
    "Le superviseur d'une coopérative voit les fermes de son groupe, ouvre n'importe quel lot et repère les problèmes tôt. Les administrateurs gèrent les comptes et les coopératives.",
    "Umugenzuzi wa koperative abona imirima yo mu itsinda rye, agafungura itsinda iryo ari ryo ryose, akabona ibibazo hakiri kare. Abayobozi bacunga konti n'amakoperative.",
  ),
  lpCoopPoint1: k(
    'Supervisors see the farms in their cooperative.',
    'Les superviseurs voient les fermes de leur coopérative.',
    "Abagenzuzi babona imirima yo muri koperative yabo.",
  ),
  lpCoopPoint2: k(
    'Farmers see only their own farms.',
    'Les agriculteurs ne voient que leurs propres fermes.',
    'Abahinzi babona imirima yabo gusa.',
  ),

  // FAQ
  lpFaqEyebrow: k('FAQ', 'FAQ', 'Ibibazo'),
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
    'Which diseases does the platform identify?',
    'Quelles maladies la plateforme identifie-t-elle ?',
    'Ni izihe ndwara porogaramu imenya?',
  ),
  lpFaq2A: k(
    'Flacherie, Grasserie, Muscardine and Pebrine. It also tells you when a worm looks healthy.',
    'Flacherie, grasserie, muscardine et pébrine. Elle indique aussi quand un ver semble sain.',
    "Flacherie, Grasserie, Muscardine na Pebrine. Inavuga igihe inyo isa nk'ifite ubuzima bwiza.",
  ),
  lpFaq3Q: k(
    'Can the disease check be wrong?',
    'La détection peut-elle se tromper ?',
    "Isuzuma ry'indwara rishobora kwibeshya?",
  ),
  lpFaq3A: k(
    'Yes. Like any AI tool, it can make mistakes. Each result shows a confidence score, so you see how sure it is. Use it as a quick second opinion and ask an extension officer before big decisions.',
    "Oui. Comme tout outil d'IA, elle peut se tromper. Chaque résultat affiche un score de confiance pour que vous sachiez à quel point elle est sûre. Prenez-la comme un avis rapide et demandez conseil à un technicien avant les grandes décisions.",
    "Yego. Nk'igikoresho cyose cya AI, gishobora kwibeshya. Buri gisubizo kigaragaza urugero rw'icyizere, ukabona uko yizeye. Gikoreshe nk'igitekerezo cya kabiri cyihuse, ubaze umugenzuzi w'ubuhinzi mbere y'ibyemezo bikomeye.",
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
    'Can a whole cooperative use it?',
    'Une coopérative entière peut-elle l’utiliser ?',
    'Koperative yose yayikoresha?',
  ),
  lpFaq6A: k(
    'Yes. Supervisors see every farm in their cooperative. Admins manage accounts and cooperatives.',
    'Oui. Les superviseurs voient chaque ferme de leur coopérative. Les administrateurs gèrent les comptes et les coopératives.',
    "Yego. Abagenzuzi babona buri murima wo muri koperative yabo. Abayobozi bacunga konti n'amakoperative.",
  ),

  // Contact
  lpContactTitle: k('Talk to us.', 'Parlez-nous.', 'Tuvugishe.'),
  lpContactSub: k(
    'Ask a question, request a demo or tell us about your cooperative. We reply by email.',
    'Posez une question, demandez une démo ou parlez-nous de votre coopérative. Nous répondons par e-mail.',
    "Baza ikibazo, saba demo cyangwa utubwire ibya koperative yawe. Tubasubiza kuri imeri.",
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
  lpCtaButton: k('Create your account', 'Créer votre compte', 'Fungura konti yawe'),
  lpFooterName: k(
    'Smart Sericulture Management System',
    'Smart Sericulture Management System',
    'Smart Sericulture Management System',
  ),
  lpFooterTagline: k('Built in Rwanda.', 'Conçu au Rwanda.', 'Byakorewe mu Rwanda.'),
  lpFooterBlurb: k(
    'Silk farming software for Rwandan farmers and cooperatives.',
    'Un logiciel de sériciculture pour les agriculteurs et les coopératives du Rwanda.',
    "Porogaramu y'ubworozi bw'inyo z'ubudodo ku bahinzi n'amakoperative byo mu Rwanda.",
  ),
  lpFooterExplore: k('Explore', 'Explorer', 'Reba'),
  lpFooterAccount: k('Account', 'Compte', 'Konti'),
  lpFooterLegal: k('Legal', 'Mentions légales', 'Amategeko'),
  lpFooterCreate: k('Create account', 'Créer un compte', 'Fungura konti'),
  lpFooterPrivacy: k('Privacy', 'Confidentialité', 'Ibanga'),
  lpFooterTerms: k('Terms', 'Conditions', 'Amabwiriza'),
  lpFooterPhotos: k('Photos from Pexels.', 'Photos de Pexels.', 'Amafoto aturuka kuri Pexels.'),

  // Sign in pages, not found and access denied
  lpAuthBack: k('Back to home', "Retour à l'accueil", "Subira ku rupapuro rwa mbere"),
  lpAuthShowPwd: k('Show password', 'Afficher le mot de passe', "Erekana ijambo ry'ibanga"),
  lpAuthHidePwd: k('Hide password', 'Masquer le mot de passe', "Hisha ijambo ry'ibanga"),
  lpNotFoundTitle: k('This page is not here.', 'Cette page est introuvable.', 'Uru rupapuro ntirurimo.'),
  lpNotFoundBody: k(
    'The link may be old, or the address may have a typo.',
    "Le lien est peut-être ancien, ou l'adresse contient une faute de frappe.",
    'Ihuza rishobora kuba rishaje, cyangwa aderesi ifite ikosa.',
  ),
  lpGoBack: k('Go back', 'Retour', 'Subira inyuma'),
  lpGoHome: k('Go home', "Aller à l'accueil", 'Ku rupapuro rwa mbere'),
  lpDashboard: k('Open dashboard', 'Ouvrir le tableau de bord', 'Fungura dashboard'),
  lpDeniedTitle: k("You can't open this page.", 'Vous ne pouvez pas ouvrir cette page.', 'Ntushobora gufungura uru rupapuro.'),
  lpDeniedBody: k(
    'Your account does not have access to it. If you think this is a mistake, contact your cooperative or an administrator.',
    "Votre compte n'y a pas accès. Si vous pensez qu'il s'agit d'une erreur, contactez votre coopérative ou un administrateur.",
    "Konti yawe nta burenganzira ifite bwo kuyifungura. Niba utekereza ko ari ikosa, vugana n'amakoperative yawe cyangwa umuyobozi.",
  ),
} satisfies Record<string, Entry>;

export type LandingKey = keyof typeof landingTranslations;
export const LANDING_KEYS = Object.keys(landingTranslations) as LandingKey[];
