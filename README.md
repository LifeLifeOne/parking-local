# Parking local

Application de bureau en français pour gérer un parking et ses transferts à l’aéroport, hors ligne, sous Linux/Omarchy et Windows 10/11 x64.

- Rendez-vous du jour, coordonnées et feuille PDF imprimable.
- Planning journée, semaine et mois, occupation maximale et places restantes.
- Clients habituels, historique, recherche de plaques et réservations.
- Options, confirmations, arrivées et sorties réelles, paiements en centimes.
- Contrôle de capacité sur toute la période ; retours retardés toujours comptés.
- Sauvegardes SQLite vérifiées, copie externe, restauration avec copie de sécurité.

## Installer et utiliser

Consultez [l’installation sans terminal](docs/INSTALLATION.md) et le [guide utilisateur](docs/UTILISATION.md). Les installateurs validés sont publiés dans les Releases lors d’un tag `v*`. Les builds de branche sont téléchargeables dans les artefacts GitHub Actions.

Cette première version doit passer la recette graphique sur Windows et Omarchy avant utilisation réelle. La liste des contrôles se trouve dans [la recette](docs/RECETTE.md).

## Développement

Pendant la recette utilisateur, le workflow GitHub CI est temporairement désactivé. Les tests et les builds sont réalisés localement pour raccourcir les cycles de correction ; le workflow pourra être réactivé après cette phase.

Architecture : React + TypeScript + Tauri 2 ; règles métier et stockage SQLite dans le crate Rust `core`. L’interface ne gère aucun fichier de données directement. Une seule instance peut être ouverte par utilisateur. Les données sont dans le dossier local utilisateur de l’identifiant `fr.parking-local.desktop`, séparées du programme.

Prérequis développeur : Node 22.12+ ou 24, Rust stable et [les dépendances Tauri](https://v2.tauri.app/start/prerequisites/).

```sh
npm ci
npm run tauri -- dev
npm test
cargo test --locked --manifest-path core/Cargo.toml
npm run build
npm run tauri -- build
```

`npm run dev` ouvre uniquement la partie web : les opérations locales nécessitent le moteur Tauri. Il n’y a pas de faux stockage navigateur.

Le pipeline exécute tests, formatage et Clippy sur Linux et Windows, audite les deux graphes de dépendances Rust et npm, lance CodeQL puis produit AppImage et NSIS. Les commits et titres de PR suivent [Conventional Commits](https://www.conventionalcommits.org/fr/v1.0.0/).

## Règles importantes

Les intervalles sont semi-ouverts : un dépôt exactement au retrait prévu est autorisé. Sans heure, le dépôt commence à minuit et le retrait finit au minuit suivant dans Europe/Paris. Au passage à l’heure d’automne, un horaire ambigu utilise la première occurrence pour le dépôt et la dernière pour le retrait. Les heures inexistantes du printemps sont refusées.

Les options n’expirent pas. Une voiture en cours dont le retrait prévu est dépassé occupe une place sans date de fin jusqu’à la sortie réelle. Une arrivée réelle peut être enregistrée même en dépassement pour conserver une représentation fidèle du parking ; les nouvelles options et confirmations sont alors bloquées si nécessaire. Une annulation ne supprime pas l’historique ; une voiture présente doit d’abord sortir.

Les sauvegardes quotidiennes sont créées via l’API de sauvegarde SQLite, vérifiées puis remplacées. Les copies de sécurité avant restauration ne sont pas soumises à la rétention de 30 jours. Le schéma actuel est version 1 ; une version inconnue est refusée. Toute future migration devra sauvegarder la base avant modification.
