---
name: qa-audit
description: Audite un projet web dans un vrai navigateur — console, accessibilité, responsive, liens, médias — et produit un rapport HTML autoportant. À utiliser quand l'utilisateur demande d'auditer ou de tester un site ou une application, de faire une recette, de vérifier ce qui casse dans le navigateur (audit a web project, run a QA pass, test this app).
---

# Audit QA

Agis comme un ingénieur QA qui teste un projet dans un navigateur visible.
Livrable : un rapport HTML autoportant, en un seul fichier.

---

## 0. Outillage

Ce skill pilote le navigateur via `playwright-cli`. Vérifie qu'il est présent, installe-le
sinon — une commande, aucune configuration de projet :

```bash
playwright-cli --version || npm install -g @playwright/cli@latest
```

Si `playwright-cli open` se plaint ensuite d'un navigateur manquant :

```bash
playwright-cli install-browser chromium
```

Un Chrome déjà installé sur la machine convient aussi : `--browser=chrome` l'utilise et ne
télécharge rien.

---

## 1. Reconnaissance

Regarde avant de décider quoi tester.

- `README` — comment ça se lance. Le fichier le plus utile, quand il existe.
- `package.json` — scripts et framework.
- Le HTML d'entrée et ses scripts quand il n'y a ni l'un ni l'autre.

Puis sers le projet. **`file://` est bloqué**, un serveur HTTP est donc obligatoire même
pour une page statique :

1. Une URL donnée en argument → rien à lancer.
2. La commande du projet lui-même (`npm run dev`…).
3. `npx --yes serve -l <port> <dossier>` pour un dossier statique.

**Lis l'URL que le serveur affiche, ne suppose jamais le port.** Vite bascule sur 5174
quand 5173 est pris et ne l'annonce que sur sa sortie standard — interroger le port
supposé renvoie un `200` venant du serveur de quelqu'un d'autre. **Attends en boucle qu'il
réponde** plutôt que de dormir une fois : Vite démarre en moins d'une seconde, `next dev`
met 5 à 15 secondes.

**Reste dans le projet qu'on t'a désigné.** Un front qui a besoin de son API, c'est une
contrainte à annoncer dans le plan, pas une permission de démarrer des services que
personne n'a mentionnés.

**N'ouvre jamais un fichier d'identifiants.** Tables d'utilisateurs, `.env`, dumps de
session. Qu'un tel fichier contienne des mots de passe en clair est un constat à signaler ;
son contenu ne doit jamais apparaître dans la conversation.

---

## 2. Le plan, puis l'arrêt

Propose 4 à 6 chapitres tirés de ce que ce projet a réellement — pas d'une liste figée.
Ceux qui méritent souvent leur place :

- erreurs console et requêtes en échec
- accessibilité : titres, landmarks, labels, contraste, clavier
- un second viewport (390×844) et le débordement horizontal
- liens internes et ancres qui résolvent
- images : cassées, `alt` manquant, lazy loading
- ce qui est spécifique ici — un formulaire, une modale, un canvas, un filtre

### Puis termine ton tour

Présente le plan et **ne lance rien**. Ni le build, ni le serveur, ni le navigateur.

Pose la question avec `AskUserQuestion` et attends le **message suivant** de l'utilisateur.

**Les mots qui ont invoqué le skill ne valent jamais approbation.** « Lance le skill »,
« run the audit », « vas-y teste » — ces phrases démarrent le skill, c'est-à-dire
démarrent à la reconnaissance. Elles ne peuvent pas approuver un plan qui n'existait pas
quand elles ont été écrites. Seule une réponse donnée **après** l'affichage du plan compte.

C'est la règle qui rend l'outil sûr à pointer sur un vrai projet.

---

## 3. Exécution

**En headed, toujours.** Voir le navigateur travailler est ce qui rend un audit digne de
confiance : l'utilisateur voit ce qui a été cliqué au lieu de croire le rapport sur parole.

```bash
playwright-cli open <URL> --browser=chrome --headed
```

Retire `--browser=chrome` si Chrome est absent ; le chromium embarqué prend le relais.

Range les artefacts dans `.qa-audit/` à la racine du projet, et propose de l'ajouter au
`.gitignore`.

### Prends des captures

Une capture par chapitre, plus une par constat visuel. Sans elles, le rapport n'est qu'une
liste d'affirmations.

```bash
playwright-cli screenshot --filename=.qa-audit/screenshots/01-accueil.jpg
```

Toujours en **`.jpg`** : environ cinq fois plus léger que le PNG, ce qui garde le rapport
partageable une fois les images embarquées.

Pour montrer un problème, encadre l'élément fautif **avant** de capturer, puis retire le
surlignage :

```bash
playwright-cli highlight "<sélecteur>" --style="outline: 3px solid #ff2d2d; outline-offset: 4px"
playwright-cli screenshot --filename=.qa-audit/screenshots/03-contraste.jpg
playwright-cli highlight --hide
```

Le `--hide` n'est pas optionnel : un surlignage laissé actif pollue les captures suivantes
**et fait échouer les clics** sur les petites cibles (voir les pièges plus bas).

### Mesure, ne décris pas

Un constat ne vaut que s'il porte le chiffre qui le prouve. Groupe les mesures en un seul
appel plutôt que d'en multiplier :

```bash
playwright-cli --raw eval "(() => { /* … */ return JSON.stringify({ … }); })()"
```

Relève un avant/après autour de chaque interaction — cette paire **est** la preuve.

### Ne mesure jamais la performance sur un serveur de dev

Le même projet Vite + React : **3,58 Mo** servi par `vite dev`, **0,09 Mo** une fois
construit. Rapporter le chiffre du dev invente un problème. Construis et sers la sortie
avant toute affirmation sur le poids ou la vitesse, ou bien étiquette les chiffres comme
« mode dev » en précisant qu'ils ne sont pas comparables.

L'outillage de dev ajoute aussi du bruit console — la notice React DevTools, le client HMR
de Vite, l'overlay de Next. Attribue-les à l'outillage, pas au projet.

---

## 4. Éviter les faux positifs

Un rapport qui crie au loup finit ignoré. Quatre règles, chacune apprise à ses dépens :

**Jamais de constat sur une seule observation.** `curl` renvoie régulièrement des HTTP 000
et des réponses de taille nulle, de façon transitoire. Reteste avant de conclure.

**Trouve le mécanisme avant de juger.** Un `display:none` peut être une révélation
progressive pilotée par une classe. Remonte la chaîne des ancêtres, trouve la règle qui le
pose, teste le déclencheur. Ce qui ressemble à un bug est souvent voulu.

**Soupçonne l'instrument avant le projet.** Lire les pixels d'un canvas WebGL renvoie du
noir sans `preserveDrawingBuffer` — confirme par une capture d'écran. Un clic sans effet
vient presque toujours de ton propre surlignage `highlight` qui recouvre la cible. Une
molette sans effet signifie que le curseur est hors du conteneur défilable.

**Nomme ce qui est bien fait, aussi précisément que les bugs.** Un bon motif déjà présent
dans le code est la meilleure correction à proposer pour un mauvais motif ailleurs.

Puis classe chaque constat : **bug** (cassé), **warning** (dégradé ou accessibilité),
**info** (améliorable).

---

## 5. Pièges de playwright-cli

| Piège | Contournement |
|---|---|
| `file://` bloqué | servir en HTTP |
| Un `highlight` actif fait échouer `click` sur une petite cible — l'overlay couvre le point de test | `highlight --hide` avant de cliquer, puis `mousedown` / `mouseup` |
| La molette ne défile que le conteneur sous le curseur | `mousemove` au centre de ce conteneur d'abord |
| Les refs (`e130`) périment dès que le DOM bouge | re-`snapshot` après un clic, ou viser en CSS |
| `eval` prend une **expression**, pas des instructions | envelopper dans une IIFE : `(() => { … return x })()` |
| Le répertoire courant du shell est réinitialisé entre les appels | `cd` dans chaque commande |
| `.playwright-cli/` apparaît dans le répertoire courant | le supprimer au nettoyage |

Agir sur un **ref** plutôt que sur un sélecteur CSS fait produire du code Playwright en
`getByRole(...)` au lieu de `locator('#id')` — utile dès que l'utilisateur pourrait le
réutiliser.

---

## 6. Rapport

Écris un unique fichier HTML autoportant dans `.qa-audit/report.html` : aucun asset
externe, captures embarquées en base64, et un `<meta charset="utf-8">` — sans lui, les
accents deviennent illisibles.

Structure : en-tête avec l'URL et la date · quatre chiffres clés · les constats du plus
grave au moins grave, chacun portant sa **mesure** · ce qui fonctionne · les captures,
celles qui montrent un problème encadrées en rouge.

Le style ci-dessous, **en thème clair uniquement** — un rapport se lit et s'imprime, il
n'a pas à suivre le thème système. Reprends-le tel quel : des cartes blanches sur fond
gris très clair, une ombre douce plutôt qu'une bordure, et une teinte de gravité sur le
bord gauche de chaque constat.

```html
<style>
  :root { --bg:#f5f6f8; --panel:#fff; --ink:#15171c; --muted:#71767f; --line:#e7e9ee;
          --accent:#e85d26; --red:#dc2626; --amber:#d97706; --green:#059669;
          --shadow:0 1px 2px rgba(16,24,40,.04), 0 4px 12px rgba(16,24,40,.05); }
  * { box-sizing:border-box; }
  body { background:var(--bg); color:var(--ink); margin:0 auto; max-width:940px;
         padding:56px 24px 80px; font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif; }
  .kicker { font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace; letter-spacing:.18em;
            text-transform:uppercase; color:var(--accent); margin-bottom:14px; }
  h1 { font-size:40px; line-height:1.1; letter-spacing:-.025em; margin:0 0 14px; font-weight:680; }
  h1 span { color:var(--accent); }
  .meta { display:flex; flex-wrap:wrap; gap:6px 24px; font-size:13.5px; color:var(--muted);
          padding-bottom:32px; border-bottom:1px solid var(--line); }
  .meta b { color:var(--ink); font-weight:600; }
  h2 { font-size:12px; font-weight:600; letter-spacing:.14em; text-transform:uppercase;
       color:var(--muted); margin:46px 0 18px; }
  .metrics { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; }
  .metric { background:var(--panel); border-radius:14px; padding:22px 20px; box-shadow:var(--shadow); }
  .metric .n { font-size:34px; font-weight:680; line-height:1; letter-spacing:-.03em; }
  .metric .l { font-size:12.5px; color:var(--muted); margin-top:8px; }
  .metric.good .n { color:var(--green); } .metric.warn .n { color:var(--amber); }
  .metric.bad .n { color:var(--red); }
  .card { background:var(--panel); border-radius:14px; padding:24px; margin-bottom:14px;
          box-shadow:var(--shadow); border-left:3px solid transparent; }
  .bug  { border-left-color:var(--red);   background:linear-gradient(90deg,#fef4f3 0%,#fff 22%); }
  .warn { border-left-color:var(--amber); background:linear-gradient(90deg,#fff9ef 0%,#fff 22%); }
  .info { border-left-color:#2563eb;      background:linear-gradient(90deg,#f2f6ff 0%,#fff 22%); }
  .card h3 { margin:0 0 10px; font-size:17.5px; letter-spacing:-.01em; }
  .tag { display:inline-block; font:600 10px/1 ui-monospace,Menlo,monospace; letter-spacing:.1em;
         text-transform:uppercase; padding:5px 9px; border-radius:6px; color:#fff; margin-bottom:12px; }
  .bug .tag { background:var(--red); } .warn .tag { background:var(--amber); } .info .tag { background:#2563eb; }
  .card p { margin:0 0 14px; }
  pre { background:#f7f8fa; border:1px solid var(--line); border-radius:10px; padding:15px;
        overflow-x:auto; font:12.5px/1.7 ui-monospace,SFMono-Regular,Menlo,monospace; margin:0 0 14px; }
  .fix { background:#f7f8fa; border-radius:10px; padding:14px 16px; font-size:14px; margin:0!important; }
  ul.ok { list-style:none; margin:0; padding:8px 24px; background:var(--panel);
          border-radius:14px; box-shadow:var(--shadow); }
  ul.ok li { padding:14px 0 14px 28px; border-top:1px solid var(--line); position:relative; }
  ul.ok li:first-child { border-top:none; }
  ul.ok li::before { content:"\2713"; position:absolute; left:0; top:14px; color:var(--green); font-weight:700; }
  ul.ok b { display:block; font-size:14.5px; } ul.ok span { font-size:13px; color:var(--muted); }
  figure { margin:0 0 16px; background:var(--panel); border-radius:14px; overflow:hidden; box-shadow:var(--shadow); }
  figure img { display:block; width:100%; }
  figure figcaption { padding:14px 18px; font-size:13px; color:var(--muted); }
  figure.flag { box-shadow:0 0 0 2px var(--red), var(--shadow); }
  footer { margin-top:56px; padding-top:20px; border-top:1px solid var(--line);
           font-size:12.5px; color:var(--muted); }
</style>
```

Les classes attendues : `.kicker` et `h1 span` pour le titre · `.meta` pour la ligne
URL/date · `.metric` (+ `.good` / `.warn` / `.bad`) pour les chiffres clés · `.card`
(+ `.bug` / `.warn` / `.info`) avec un `.tag` pour chaque constat · `pre` pour la mesure ·
`.fix` pour la correction proposée · `ul.ok` pour ce qui fonctionne · `figure` (+ `.flag`
si la capture montre un problème).

Ouvre-le avec l'outil de la plateforme : `open` (macOS), `xdg-open` (Linux),
`start` (Windows).

---

## 7. Nettoyage

Toujours, même si l'audit s'est arrêté en cours de route :

```bash
playwright-cli close
# arrêter le serveur que tu as lancé
rm -rf .playwright-cli
```

Termine par une synthèse courte dans la langue de l'utilisateur : les bugs confirmés avec
la mesure qui prouve chacun, ce qui fonctionne, et le chemin du rapport. Mentionne les
fausses pistes que tu as écartées — c'est ce qui donne du crédit au reste.
