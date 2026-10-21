# Bracket Draw

A spinning-wheel draw for round-robin brackets. Each entry is a team (or player) plus their club. The wheel looks like a random spin, and the landing keeps two rules:

- Brackets stay the same size, give or take one team.
- Teams from the same club are split apart whenever there are enough brackets.

When a club has more teams than brackets, the extras are spread as evenly as possible. Ties between equally fair brackets are random.

```bash
yarn dev
yarn test
```

Open the app, add teams, choose how many brackets, and spin. Paste lines as `Team, Club`. Load the sample tournament to see a full draw.
