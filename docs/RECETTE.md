# Vérification avant mise en service

Les tests automatiques vérifient chevauchements, options, annulations, exclusions lors de modification, capacité, horaires inconnus, changements d’heure, minuit, retards, stockage clients, transferts, PDF, sauvegarde/restauration, fichiers corrompus/incompatibles, support absent et récupération d’une écriture interrompue. Les tests d’interface vérifient ouverture d’un séjour, coordonnées, transferts indépendants, saisie monétaire et protection des modifications.

## Recette graphique distincte sur Omarchy et Windows

- Installer dans un compte neuf, hors ligne, sans terminal ; lancer depuis le raccourci.
- Configurer deux places ; réserver deux séjours qui se chevauchent ; vérifier le refus d’un troisième et d’une réduction à une place.
- Vérifier un départ à 10 h et une arrivée à 10 h ; tester sans horaires et sur les journées de changement d’heure.
- Enregistrer une arrivée, dépasser le retrait prévu et vérifier l’alerte et la capacité ; enregistrer la sortie.
- Ajouter deux transferts ; vérifier les horaires, actions, notes et le nombre de clients distincts dans la journée.
- Retrouver un client et sa plaque ; réutiliser ses coordonnées.
- Exporter et imprimer un PDF avec accents, beaucoup de rendez-vous et plusieurs pages.
- Modifier une réservation, quitter via navigation puis via fermeture de fenêtre ; vérifier la confirmation.
- Sauvegarder sur USB, retirer le support, modifier un séjour, attendre 30 secondes, reconnecter et vérifier la copie.
- Restaurer une copie antérieure ; vérifier la copie de sécurité et le rejet d’une copie corrompue/incompatible.
- Arrêter le processus pendant l’écriture d’une copie ; vérifier que la précédente reste restaurable.
- Installer une nouvelle version ; vérifier clients, séjours, réglages et sauvegardes conservés.
- Essayer un second lancement ; vérifier qu’il remet la fenêtre existante au premier plan.

Les builds CI sur chaque système ne remplacent pas cette recette sur une machine de bureau réelle. Noter date, OS, version de l’application et résultat de chaque contrôle avant utilisation avec des clients.
