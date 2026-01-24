import React, { createContext, useContext, useState, useEffect } from 'react';
import { CURRENT_USER, QUESTIONS } from '@/lib/mockData';
import { useToast } from '@/hooks/use-toast';

const GameContext = createContext(undefined);

export function GameProvider({ children }) {
  const [user, setUser] = useState(CURRENT_USER);
  const [completedQuestions, setCompletedQuestions] = useState([]);
  const { toast } = useToast();

  // Sync points
  const points = user.points;

  const addPoints = (amount) => {
    setUser(prev => ({ ...prev, points: prev.points + amount }));
    toast({
      title: `+${amount} Points!`,
      description: "Keep up the great work!",
      variant: "default",
      className: "bg-success text-white border-none"
    });
  };

  const markQuestionComplete = (id) => {
    if (!completedQuestions.includes(id)) {
      setCompletedQuestions(prev => [...prev, id]);
    }
  };

  return (
    <GameContext.Provider value={{ 
      user, 
      points, 
      addPoints, 
      questions: QUESTIONS, 
      completedQuestions,
      markQuestionComplete
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
