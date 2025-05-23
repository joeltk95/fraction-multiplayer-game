import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import Card from './components/Card';
import styles from './App.module.css';

const socket = io('http://localhost:3001');

function App() {
  const [playerId, setPlayerId] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deckSize, setDeckSize] = useState(0);
  const [resetCountdown, setResetCountdown] = useState(null); // NEW

  useEffect(() => {
    socket.emit('joinGame');

    socket.on('gameStateUpdate', (state) => {
      if (state) {
        setDeckSize(state.deckSize || 0);
        setGameState(state);
        setError('');
      }
    });

    socket.on('playerId', (id) => {
      if (id) setPlayerId(id);
    });

    socket.on('message', (msg) => setMessage(msg || ''));
    socket.on('errorMsg', (errMsg) => setError(errMsg || ''));

    // NEW: Listen for reset countdown
    socket.on('roundResetCountdown', ({ secondsLeft }) => {
      setResetCountdown(secondsLeft);
    });

    return () => {
      socket.off('gameStateUpdate');
      socket.off('playerId');
      socket.off('message');
      socket.off('errorMsg');
      socket.off('roundResetCountdown'); // NEW
    };
  }, []);

  // NEW: Countdown effect
  useEffect(() => {
    if (resetCountdown === null || resetCountdown <= 0) return;

    const interval = setInterval(() => {
      setResetCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [resetCountdown]);

  const toMixedFraction = (numer, denom) => {
    if (!denom || denom === 0) return '';
    const whole = Math.floor(numer / denom);
    const remainder = numer % denom;
    if (remainder === 0) return `${whole}`;
    if (whole === 0) return `${remainder}/${denom}`;
    return `${whole} and ${remainder}/${denom}`;
  };

  if (!gameState)
    return (
      <div className='text-center mt-20 text-xl text-gray-700'>
        Loading game...
      </div>
    );
  if (!playerId)
    return (
      <div className='text-center mt-20 text-xl text-gray-700'>
        Waiting for player assignment...
      </div>
    );

  const playerIndex = gameState.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1)
    return (
      <div className='text-center mt-20 text-xl text-gray-700'>
        Joining game, please wait...
      </div>
    );

  const createDummyPlayer = (position) => ({
    id: `dummy-${position}`,
    name: position === 0 ? 'You (Waiting...)' : 'Waiting for player...',
    cards: [],
    dummy: true,
  });

  const getPlayerByOffset = (offset) => {
    const len = gameState.players.length;
    const idx = (playerIndex + offset + len) % len;
    return gameState.players[idx] || createDummyPlayer(offset);
  };

  const bottomPlayer = getPlayerByOffset(0);
  const leftPlayer = getPlayerByOffset(1);
  const topPlayer = getPlayerByOffset(2);
  const rightPlayer = getPlayerByOffset(3);
  const currentPlayer = gameState.players[gameState.currentPlayerIndex] || {};

  const playCard = (cardIndex) => {
    if (playerId) {
      socket.emit('playCard', { playerId, cardIndex });
    }
  };

  const renderFacedownCards = (
    count,
    horizontal = false,
    cardRotationClass = ''
  ) => (
    <div
      className={`flex ${horizontal ? 'flex-row' : 'flex-col'} gap-2`}
      style={{ minWidth: horizontal ? 'max-content' : '60px' }}
    >
      {Array(count)
        .fill(null)
        .map((_, i) => (
          <div
            key={i}
            className={`w-[50px] h-[70px] bg-gray-600 rounded-md shadow-inner flex items-center justify-center text-white text-xl select-none ${cardRotationClass}`}
          >
            🂠
          </div>
        ))}
    </div>
  );

  const renderPlayerCards = (player, cardRotationClass = '') => {
    if (player.dummy) return renderFacedownCards(5, true, cardRotationClass);
    if (!player.cards || player.cards.length === 0)
      return (
        <p className='text-center italic text-[#7f8c8d]'>No cards left!</p>
      );

    return (
      <div className='flex flex-row gap-4'>
        {player.cards.map((card, i) => (
          <Card
            key={i}
            fraction={card.fraction}
            imageSrc={card.image}
            onClick={() => {
              if (playerId === currentPlayer.id && player.id === playerId) {
                playCard(i);
              }
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <div className='p-6 md:p-8 min-h-screen bg-sky-50 font-sans relative'>
      <h1 className='text-4xl md:text-5xl text-center mb-6 font-bold text-slate-800'>
        Fraction Showdown
      </h1>

      <div className='text-lg md:text-xl mb-2 text-slate-700'>
        Your ID: <span className='font-semibold text-teal-600'>{playerId}</span>
      </div>
      <div className='text-lg md:text-xl mb-2 text-slate-700'>
        Current Player:{' '}
        <span className='font-semibold text-teal-600'>
          {currentPlayer.name}
        </span>
      </div>

      <div className='text-sm text-gray-600 absolute top-4 right-4 bg-white px-3 py-2 rounded shadow-md'>
        Deck Size: {deckSize}
      </div>

      {/* NEW: Countdown display */}
      {resetCountdown !== null && (
        <div className='text-center text-2xl font-bold text-purple-700 mb-4'>
          🔄 Next round starting in {resetCountdown}s...
        </div>
      )}

      <div className='h-6 bg-gray-200 rounded-lg overflow-hidden my-4'>
        <div
          className='h-full bg-green-500 transition-all duration-300 ease-in-out'
          style={{ width: `${(gameState.plate / gameState.target) * 100}%` }}
        />
      </div>

      <div className='text-center text-lg font-medium my-2 text-slate-700'>
        Current Plate:{' '}
        <span className='text-blue-700'>
          {gameState.plateFraction} (
          {toMixedFraction(gameState.plateNumer, gameState.plateDenom)})
        </span>
      </div>
      <div className='text-center text-lg font-medium my-2 text-red-600'>
        Target: {gameState.targetFraction}
      </div>

      <div className='relative w-full max-w-5xl mx-auto h-[600px] mt-10 bg-blue-100 rounded-xl shadow-lg'>
        {topPlayer && (
          <div className='absolute top-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center'>
            <div className='mb-2 font-semibold text-lg'>{topPlayer.name}</div>
            {renderFacedownCards(topPlayer.cards.length, true)}
          </div>
        )}

        {leftPlayer && (
          <div className='absolute top-1/2 left-4 transform -translate-y-1/2 flex flex-col items-center'>
            <div className='mb-2 font-semibold text-lg'>{leftPlayer.name}</div>
            {renderFacedownCards(
              leftPlayer.cards.length,
              false,
              styles.rotateLeft
            )}
          </div>
        )}

        {rightPlayer && (
          <div className='absolute top-1/2 right-4 transform -translate-y-1/2 flex flex-col items-center'>
            <div className='mb-2 font-semibold text-lg'>{rightPlayer.name}</div>
            {renderFacedownCards(
              rightPlayer.cards.length,
              false,
              styles.rotateRight
            )}
          </div>
        )}

        {bottomPlayer && (
          <div className='absolute bottom-4 left-1/2 transform -translate-x-1/2 flex flex-col items-center'>
            <div className='mb-2 font-semibold text-lg'>
              {bottomPlayer.name} (You)
            </div>
            {renderPlayerCards(bottomPlayer)}
          </div>
        )}
      </div>

      <div className='text-xl my-6 font-semibold text-blue-700 text-center'>
        {playerId === currentPlayer.id
          ? 'It’s your turn!'
          : `Waiting for ${currentPlayer.name}...`}
      </div>

      {message && (
        <p className='font-bold text-green-600 text-center'>{message}</p>
      )}
      {error && <p className='font-bold text-red-500 text-center'>{error}</p>}
    </div>
  );
}

export default App;
