# Site JMM — Guide de mise en route

Ce site contient :
- Le catalogue public (produits, couleurs, longueurs, panier, commande)
- Le panneau de gestion (`/admin`) pour gérer le stock, les prix, les produits
- Le paiement à la livraison (actif dès le départ)
- Le paiement en ligne par carte (optionnel — à activer via Stripe quand tu es prêt)

Tu n'as besoin d'aucune connaissance en programmation pour suivre ce guide. Chaque étape est une commande à copier-coller, ou un compte à créer sur un site web.

---

## Partie 1 — Tester le site sur ton ordinateur

### Ce qu'il faut installer une seule fois

1. **Node.js** (le moteur qui fait fonctionner le site) : va sur [nodejs.org](https://nodejs.org), télécharge et installe la version "LTS" (recommandée).
2. Ouvre une fenêtre de terminal (sur Windows: cherche "PowerShell" dans le menu Démarrer; sur Mac: cherche "Terminal").

### Préparer le projet

Dans le terminal, déplace-toi dans le dossier du projet (remplace le chemin par l'endroit où tu as dézippé le fichier) :

```bash
cd chemin/vers/jmm-site
```

Installe les dépendances du projet (à faire une seule fois, ou après chaque mise à jour du code) :

```bash
npm install
```

Crée ton fichier de configuration :

```bash
cp .env.example .env
```

Ouvre le fichier `.env` avec un éditeur de texte (Bloc-notes, par exemple) et change au minimum :
- `ADMIN_USERNAME` et `ADMIN_PASSWORD` — tes identifiants pour le panneau admin
- `ADMIN_SESSION_SECRET` — remplace par une longue chaîne aléatoire (tu peux en générer une ici : https://generate-secret.vercel.app/32)

Laisse `DATABASE_URL="file:./dev.db"` tel quel pour tester en local. Laisse les champs Stripe vides pour l'instant.

### Créer ton compte admin et démarrer

```bash
npm run seed
```

Ça crée ton compte admin et quelques catégories de départ (Tôle, Gouttière, Accessoire).

```bash
npm run dev
```

Ouvre ton navigateur à l'adresse **http://localhost:3000** — tu devrais voir le catalogue (vide pour l'instant, puisque aucun produit n'a encore été créé).

Va à **http://localhost:3000/admin** pour te connecter avec les identifiants mis dans `.env`, et commence à ajouter tes produits.

---

## Partie 2 — Mettre le site en ligne pour de vrai

Une fois que tu es satisfait du fonctionnement en local, voici comment le rendre accessible à tes clients sur Internet. Cette partie demande de créer deux comptes gratuits.

### Étape 1 — Créer la base de données en ligne (Turso)

Ton site a besoin d'un endroit pour garder ton stock et tes produits en permanence, accessible depuis n'importe où. **Turso** offre ça gratuitement pour un site de cette taille.

1. Va sur [turso.tech](https://turso.tech) et crée un compte gratuit.
2. Une fois connecté, installe leur outil en ligne de commande en suivant leurs instructions à l'écran (ou utilise leur interface web si tu préfères éviter le terminal).
3. Crée une base de données (le bouton "Create Database" dans leur interface).
4. Récupère deux informations dans leur tableau de bord :
   - L'**URL de connexion** (commence par `libsql://...`)
   - Un **jeton d'authentification** ("auth token" ou "create token")

Note ces deux valeurs, tu en auras besoin à l'étape 3.

### Étape 2 — Mettre le code sur GitHub

Vercel (l'hébergeur, à l'étape suivante) a besoin que ton code soit sur GitHub pour pouvoir le déployer.

1. Crée un compte gratuit sur [github.com](https://github.com) si tu n'en as pas.
2. Crée un nouveau dépôt (bouton "New repository"), donne-lui un nom comme `jmm-site`.
3. Suis les instructions affichées par GitHub pour y envoyer ton code (section "push an existing repository").

### Étape 3 — Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com) et crée un compte gratuit (tu peux te connecter directement avec ton compte GitHub, c'est le plus simple).
2. Clique sur "Add New Project" et choisis le dépôt GitHub que tu viens de créer.
3. Avant de cliquer sur "Deploy", ouvre la section "Environment Variables" et ajoute les mêmes valeurs que dans ton fichier `.env` local, mais avec ces changements :
   - `DATABASE_URL` → colle l'URL Turso (celle qui commence par `libsql://`)
   - `DATABASE_AUTH_TOKEN` → colle le jeton Turso
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` → garde les mêmes valeurs (ou change le mot de passe pour la version finale)
4. Clique sur "Deploy". Après une ou deux minutes, ton site sera en ligne avec une adresse du genre `jmm-site.vercel.app`.

### Étape 4 — Créer ton compte admin sur le site en ligne

La commande `npm run seed` que tu as lancée en local ne s'applique qu'à ta base de données locale. Pour créer ton compte admin sur la vraie base de données en ligne (Turso), lance ceci une seule fois depuis ton ordinateur, après avoir mis à jour ton `.env` local avec les valeurs Turso (les mêmes qu'à l'étape 3) :

```bash
npm run seed
```

Ton compte admin existera alors aussi sur le site en ligne.

### Étape 5 (optionnelle) — Un nom de domaine personnalisé

Par défaut ton site est à une adresse comme `jmm-site.vercel.app`. Si tu veux quelque chose comme `jmm.ca` :

1. Achète le nom de domaine chez un registraire (Namecheap, Google Domains, ou directement via Vercel).
2. Dans le tableau de bord Vercel de ton projet, va dans "Settings" → "Domains" et ajoute ton nom de domaine. Vercel te donnera des instructions précises à suivre chez ton registraire.

---

## Partie 3 — Activer le paiement en ligne par carte (optionnel)

Le site fonctionne déjà très bien avec seulement "paiement à la livraison". Quand tu seras prêt à accepter les cartes de crédit en ligne :

1. Crée un compte sur [stripe.com](https://stripe.com) et complète la vérification de ton entreprise (informations bancaires, numéro d'entreprise).
2. Dans le tableau de bord Stripe, va dans **Développeurs → Clés API** et copie ta **clé secrète** (commence par `sk_live_...` une fois ton compte activé, ou `sk_test_...` pour tester).
3. Ajoute cette valeur dans les variables d'environnement de ton projet Vercel : `STRIPE_SECRET_KEY`.
4. Toujours dans Stripe, va dans **Développeurs → Webhooks** et ajoute un nouvel endpoint avec l'URL : `https://tonsite.com/api/webhooks/stripe` (remplace par ta vraie adresse). Choisis l'événement `checkout.session.completed`.
5. Stripe te donnera un **secret de signature** — ajoute-le comme `STRIPE_WEBHOOK_SECRET` dans Vercel.
6. Redéploie le site (Vercel le fait automatiquement après un changement de variables d'environnement, ou clique "Redeploy").

Le bouton "Payer en ligne" enverra alors les clients vers une vraie page de paiement Stripe, et le stock ne sera déduit qu'une fois le paiement réellement confirmé.

---

## Utilisation au quotidien

- **Ajouter du stock reçu d'un fournisseur** : connecte-toi à `/admin`, trouve le produit, clique sur le `+` dans la case correspondant à la couleur et à la longueur reçues.
- **Ajouter un nouveau produit** : tout en bas du panneau admin, remplis le formulaire (nom, catégorie, unité, prix, longueurs séparées par virgules, couleurs).
- **Changer un prix** : clique directement dans la case de prix à côté du nom du produit.
- **Renommer un produit** : clique directement sur son nom, modifie le texte, clique ailleurs pour sauvegarder.

## En cas de problème

- Si le site affiche une erreur après un déploiement : vérifie dans Vercel que toutes les variables d'environnement sont bien remplies (section "Settings" → "Environment Variables" de ton projet).
- Si tu ne peux pas te connecter au panneau admin : vérifie que tu as bien lancé `npm run seed` avec les bonnes valeurs `ADMIN_USERNAME`/`ADMIN_PASSWORD` dans `.env`.
- Pour toute autre question, tu peux revenir avec ce projet dans une conversation avec Claude.
