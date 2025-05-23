import React from 'react';

const Card = ({ fraction, imageSrc, onClick }) => {
  return (
    <button
      onClick={onClick}
      className='w-[120px] h-[180px] rounded-2xl bg-white shadow-md hover:scale-105 hover:rotate-1 hover:shadow-xl active:scale-95 transition-transform duration-300 flex flex-col justify-between items-center p-3'
    >
      <img
        src={imageSrc}
        alt='Card'
        className='w-14 h-14 object-contain mt-2'
      />
      <span className='text-xl font-bold text-gray-800 mb-2'>{fraction}</span>
    </button>
  );
};

export default Card;
