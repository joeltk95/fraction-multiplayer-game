const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

const PORT = 3001;

let nextPlayerNumber = 1;
let deck = [];

const gameState = {
  players: [],
  deck: [],
  plate: 0,
  plateNumer: 0,
  plateDenom: 1,
  plateFraction: '0/1',
  target: 1,
  targetFraction: '1',
  currentPlayerIndex: 0,
  deckSize: 0,
};

// --- Utilities ---

function randomCard() {
  const denom = Math.floor(Math.random() * 11) + 2; // 2–12
  const numer = Math.floor(Math.random() * denom) + 1;
  const images = ['pizza.png', 'watermelon.png', 'cake.png', 'icecream.png'];
  const image = images[Math.floor(Math.random() * images.length)];

  return {
    decimal: numer / denom,
    fraction: `${numer}/${denom}`,
    numer,
    denom,
    image,
  };
}

function generateDeck() {
  return Array(100).fill(0).map(randomCard);
}

function generateCards(count = 5) {
  const cards = [];
  for (let i = 0; i < count; i++) {
    const card = deck.pop();
    if (card) cards.push(card);
  }
  return cards;
}

function simplifyFraction(numer, denom) {
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(numer, denom);
  return {
    numer: numer / divisor,
    denom: denom / divisor,
    text: `${numer / divisor}/${denom / divisor}`,
  };
}

function initializeGame() {
  deck = generateDeck();

  const numCardsForTarget = Math.floor(Math.random() * 3) + 3; // 3–5 cards
  const targetCards = deck.slice(-numCardsForTarget);
  deck.splice(-numCardsForTarget, numCardsForTarget);

  const total = targetCards.reduce(
    (acc, card) => {
      const newNumer = acc.numer * card.denom + card.numer * acc.denom;
      const newDenom = acc.denom * card.denom;
      const simplified = simplifyFraction(newNumer, newDenom);
      return {
        numer: simplified.numer,
        denom: simplified.denom,
      };
    },
    { numer: 0, denom: 1 }
  );

  const simplifiedTarget = simplifyFraction(total.numer, total.denom);
  const targetDecimal = simplifiedTarget.numer / simplifiedTarget.denom;

  gameState.plate = 0;
  gameState.plateNumer = 0;
  gameState.plateDenom = 1;
  gameState.plateFraction = '0/1';
  gameState.target = targetDecimal;
  gameState.targetFraction = `${simplifiedTarget.numer}/${simplifiedTarget.denom}`;
  gameState.deck = deck;
  gameState.players = [];
  gameState.currentPlayerIndex = 0;
}

// Add dummy players if fewer than 4 real players
function addDummyPlayers() {
  const dummyNames = [
    'Waiting for player...',
    'AI Player',
    'AI Player',
    'AI Player',
  ];
  while (gameState.players.length < 4) {
    gameState.players.push({
      id: `dummy-${gameState.players.length}`,
      name: dummyNames[gameState.players.length] || 'AI Player',
      cards: [],
    });
  }
}

// Check if player has any card that can be legally played without busting
function playerHasValidMove(player) {
  const epsilon = 0.05;
  return player.cards.some(
    (card) => gameState.plate + card.decimal <= gameState.target + epsilon
  );
}

// --- Game Start ---

initializeGame();
addDummyPlayers();

// --- Socket.IO ---

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('joinGame', () => {
    const newPlayer = {
      id: socket.id,
      name: `Player ${nextPlayerNumber++}`,
      cards: generateCards(),
    };

    // Remove all dummy players before adding real players
    gameState.players = gameState.players.filter(
      (p) => !p.id.startsWith('dummy-')
    );
    gameState.players.push(newPlayer);
    addDummyPlayers();

    socket.emit('playerId', newPlayer.id);
    io.emit('gameStateUpdate', {
      ...gameState,
      deckSize: gameState.deck.length,
    });
  });

  socket.on('playCard', ({ playerId, cardIndex }) => {
    const epsilon = 0.05; // Updated epsilon for close enough logic
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    if (currentPlayer.id !== playerId) {
      socket.emit('errorMsg', 'Not your turn');
      return;
    }

    const player = currentPlayer;
    const card = player.cards[cardIndex];

    if (!card) {
      socket.emit('errorMsg', 'Invalid card index');
      return;
    }

    const cardValue = card.decimal;
    let newPlate = gameState.plate + cardValue;

    if (Math.abs(newPlate - gameState.target) <= epsilon) {
      // Player wins
      gameState.plate = gameState.target;
      const [num, denom] = gameState.targetFraction.split('/').map(Number);
      gameState.plateNumer = num;
      gameState.plateDenom = denom;
      gameState.plateFraction = gameState.targetFraction;

      player.cards.splice(cardIndex, 1);

      io.emit('gameStateUpdate', {
        ...gameState,
        deckSize: gameState.deck.length,
      });
      io.emit(
        'message',
        `${player.name} wins! Close enough to the target: ${gameState.targetFraction}`
      );
      io.emit('gameOver', { winner: player.name });

      // Delay reset by 5 seconds
      // setTimeout(() => {
      //   initializeGame();
      //   addDummyPlayers();
      //   io.emit('message', 'New game started!');
      //   io.emit('gameStateUpdate', {
      //     ...gameState,
      //     deckSize: gameState.deck.length,
      //   });
      // }, 5000);

      return;
    }

    if (newPlate > gameState.target + epsilon) {
      // Bust: discard card, don't add to plate
      player.cards.splice(cardIndex, 1);

      io.emit(
        'message',
        `Bust! You went over the target and discarded ${card.fraction}.`
      );

      // If player has no valid moves, force discard one more card and draw
      if (!playerHasValidMove(player)) {
        io.emit(
          'message',
          `${player.name} has no valid moves and must discard and draw.`
        );
        if (player.cards.length > 0) {
          player.cards.splice(0, 1);
        }
        if (gameState.deck.length > 0) {
          player.cards.push(gameState.deck.pop());
        }
      }

      // Draw new card if available
      if (gameState.deck.length > 0) {
        const newCard = gameState.deck.pop();
        player.cards.push(newCard);
      }

      // Pass turn
      gameState.currentPlayerIndex =
        (gameState.currentPlayerIndex + 1) % gameState.players.length;

      io.emit('gameStateUpdate', {
        ...gameState,
        deckSize: gameState.deck.length,
      });
      return;
    }

    // Normal add card to plate
    const newNumer =
      gameState.plateNumer * card.denom + card.numer * gameState.plateDenom;
    const newDenom = gameState.plateDenom * card.denom;
    const simplified = simplifyFraction(newNumer, newDenom);
    gameState.plateNumer = simplified.numer;
    gameState.plateDenom = simplified.denom;
    gameState.plateFraction = simplified.text;

    gameState.plate = newPlate;
    player.cards.splice(cardIndex, 1);

    if (gameState.deck.length > 0) {
      const newCard = gameState.deck.pop();
      player.cards.push(newCard);
    } else {
      io.emit('message', 'Deck is empty! No more cards can be drawn.');
    }

    // Pass turn
    gameState.currentPlayerIndex =
      (gameState.currentPlayerIndex + 1) % gameState.players.length;

    io.emit('gameStateUpdate', {
      ...gameState,
      deckSize: gameState.deck.length,
    });
    io.emit('message', `${player.name} played ${card.fraction}.`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

    gameState.players = gameState.players.filter((p) => p.id !== socket.id);
    gameState.players = gameState.players.filter(
      (p) => !p.id.startsWith('dummy-')
    );
    addDummyPlayers();

    if (gameState.currentPlayerIndex >= gameState.players.length) {
      gameState.currentPlayerIndex = 0;
    }

    if (
      gameState.players.filter((p) => !p.id.startsWith('dummy-')).length < 2
    ) {
      initializeGame();
      addDummyPlayers();
    }

    io.emit('gameStateUpdate', {
      ...gameState,
      deckSize: gameState.deck.length,
    });
  });
});

// --- Start Server ---

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
