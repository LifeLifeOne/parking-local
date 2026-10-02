# Sécurité

Signalez une vulnérabilité par la fonction privée « Report a vulnerability » de l’onglet Security du dépôt. Ne publiez pas de base client ou de sauvegarde dans une issue.

Le pipeline audite les dépendances npm et Rust, analyse TypeScript avec CodeQL et vérifie les erreurs de compilation avec Clippy. Les actions sont figées sur leur SHA et les permissions GitHub sont limitées par job. Dependabot propose les mises à jour chaque semaine.

L’application n’utilise aucun service distant, aucune télémétrie ni plugin shell. Le navigateur n’a pas d’accès générique au système de fichiers ou à SQLite. Les données locales et les sauvegardes ne sont pas chiffrées : elles suivent les droits du compte utilisateur et du dossier de sauvegarde choisi.
