# Installer Parking local

## Windows 10 ou 11, 64 bits

1. Téléchargez l’installateur `.exe` depuis la page Releases du dépôt.
2. Ouvrez-le et suivez les étapes en français. L’installation se fait dans votre compte utilisateur.
3. Ouvrez « Parking local » depuis le menu Démarrer ou le raccourci du bureau.

WebView2 est embarqué dans l’installateur : l’installation et l’utilisation ne nécessitent pas de connexion internet. L’installateur initial n’est pas signé ; Windows peut afficher la fenêtre de vérification de l’éditeur.

## Omarchy / Linux, 64 bits

1. Téléchargez l’archive `Parking-local-Linux-x64.tar.gz`.
2. Ouvrez-la dans le gestionnaire de fichiers et extrayez son contenu.
3. Ouvrez `Parking-local.AppImage`. Si votre gestionnaire de fichiers retire les permissions de lancement, ouvrez les propriétés du fichier et activez l’autorisation d’exécution.
4. Dans l’application, cliquez sur « Installer dans mon compte ».
5. Retrouvez « Parking local » dans votre lanceur d’applications.

Le programme est installé dans `~/.local/share/parking-local/application` (ou le dossier équivalent défini par votre session). L’entrée du lanceur est créée dans le dossier `applications` de votre compte. Aucune commande de terminal n’est nécessaire.

## Mettre à jour

Windows : ouvrez le nouvel installateur. Linux : ouvrez la nouvelle AppImage et cliquez sur « Installer dans mon compte ». L’application sauvegarde les données avant de remplacer le programme sur Linux. Les données sont conservées dans un dossier différent du programme. Fermez l’ancienne version avant de démarrer la nouvelle.

Avant toute mise à jour, utilisez « Réglages → Sauvegarder maintenant » et conservez une copie externe. Les futures évolutions du schéma devront créer une sauvegarde avant migration.

## Sauvegarder ailleurs

Dans « Réglages », choisissez un dossier sur votre clé USB ou un disque externe. Cliquez sur « Sauvegarder maintenant ». Vérifiez la date de dernière copie externe réussie. Les copies sont dans le sous-dossier `Parking-local-sauvegardes`. Si le support est absent, le travail continue et la copie est retentée automatiquement.

Pour restaurer, cliquez sur « Restaurer une sauvegarde », choisissez un fichier `.sqlite`, lisez la date et le nombre de séjours, puis confirmez. L’état actuel est sauvegardé avant remplacement.
