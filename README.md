# QA Audit

Un skill Claude Code qui audite un projet web dans un **navigateur visible** et te rend un
rapport HTML autoportant.

Ce n'est pas un lanceur de tests et ça ne remplace pas ta suite de tests. C'est la passe
qu'une personne consciencieuse fait avant une démo — cliquer partout, surveiller la
console, vérifier ce qui casse sur téléphone — sauf qu'ici le rapport s'écrit tout seul.

**Un seul fichier.** [`SKILL.md`](SKILL.md), c'est tout le projet. Lis-le avant de
l'installer : c'est un peu l'intérêt.

## Installation

Les skills vivent dans `~/.claude/skills/<nom>/SKILL.md`. Il suffit d'y déposer le fichier.

**macOS / Linux**

```bash
mkdir -p ~/.claude/skills/qa-audit
curl -fsSL https://raw.githubusercontent.com/VinceMrn/qa-audit/main/SKILL.md \
  -o ~/.claude/skills/qa-audit/SKILL.md
```

**Windows (PowerShell)**

```powershell
mkdir "$env:USERPROFILE\.claude\skills\qa-audit" -Force
Invoke-WebRequest https://raw.githubusercontent.com/VinceMrn/qa-audit/main/SKILL.md `
  -OutFile "$env:USERPROFILE\.claude\skills\qa-audit\SKILL.md"
```

Puis **redémarre Claude Code** — les skills sont lus au démarrage. `qa-audit` apparaît
alors dans la liste.

Pour mettre à jour : relance la même commande. C'est tout le mécanisme.

## Prérequis

- [Claude Code](https://claude.com/claude-code) et **Node 18+**
- `playwright-cli` — le skill l'installe lui-même à la première utilisation s'il manque
- Un navigateur Chromium : ton propre Chrome, ou `playwright-cli install-browser chromium`

## Utilisation

Demande simplement :

```
Audite mon projet
Audite http://localhost:3000
Vérifie ce qui casse sur mon site
```

Il examine ton projet, **propose un plan de 4 à 6 chapitres, et s'arrête là**. Rien ne se
lance tant que tu n'as pas répondu — ni le build, ni le serveur, ni le navigateur. Tu
ajustes en une phrase, ou tu valides.

Ensuite le navigateur s'ouvre **devant toi** et l'audit se déroule.

## Ce qu'il vérifie

Les chapitres viennent de ce que ton projet a réellement, pas d'une liste figée.
Généralement : erreurs console et requêtes en échec, accessibilité (titres, landmarks,
labels, contraste, clavier), un viewport téléphone, les liens internes, les images — plus
ce qui est propre à ton projet : un formulaire, une modale, un canvas, un filtre.

## Le rapport

Un fichier HTML unique, sans dépendance, qui s'ouvre n'importe où et se partage en pièce
jointe. Organisé en **trois onglets** — Constats, Ce qui fonctionne, Captures — avec les
chiffres clés toujours visibles au-dessus.

Chaque constat est **replié par défaut** : la liste des problèmes tient sur un écran, et tu
déplies ce que tu veux lire. Pas de page de trois mètres à faire défiler.

## Pourquoi lui faire confiance

La plupart des audits automatiques t'enterrent sous des constats qu'il faut ensuite
réfuter. Celui-ci est construit pour ne pas faire ça :

- **Jamais de constat sur une seule observation.** Les échecs transitoires sont retestés.
- **Le mécanisme est compris avant d'être jugé.** Une section masquée peut être une
  révélation progressive ; le skill cherche le déclencheur avant de crier au bug.
- **L'instrument est soupçonné avant le projet.** Un canvas WebGL noir, c'est presque
  toujours `preserveDrawingBuffer`, pas un rendu cassé. Un clic sans effet, c'est le
  surlignage. Les deux pièges sont connus et contournés.
- **La performance n'est jamais mesurée sur un serveur de dev.** Le même projet Vite pèse
  3,58 Mo servi par `vite dev` et 0,09 Mo une fois construit — rapporter le premier
  invente un problème.
- **Chaque constat porte sa mesure**, et ce qui fonctionne est listé aussi précisément que
  ce qui ne fonctionne pas.

## Limites

Vérifié sur des sites statiques et une application Vite + React, sur macOS et Windows. Les
autres serveurs de développement devraient fonctionner via la commande de ton projet, mais
ça n'a pas été testé.
