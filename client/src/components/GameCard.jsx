import { useState } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, ArrowRight } from 'lucide-react';
import { useGame } from '@/context/GameContext';

export default function GameCard({ question, onNext }) {
  const [selectedOption, setSelectedOption] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { addPoints, markQuestionComplete } = useGame();

  const handleSelect = (index) => {
    if (isSubmitted) return;
    setSelectedOption(index);
  };

  const handleSubmit = () => {
    if (selectedOption === null) return;
    setIsSubmitted(true);
    
    if (selectedOption === question.correctAnswer) {
      addPoints(question.points);
      markQuestionComplete(question.id);
      // Play sound effect here if we had one
    }
  };

  const getOptionClass = (index) => {
    if (!isSubmitted) {
      return selectedOption === index
        ? "border-primary bg-indigo-50 text-primary ring-2 ring-primary ring-offset-2"
        : "border-slate-200 hover:border-primary/50 hover:bg-slate-50";
    }

    if (index === question.correctAnswer) {
      return "border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500 ring-offset-2";
    }

    if (selectedOption === index && index !== question.correctAnswer) {
      return "border-rose-500 bg-rose-50 text-rose-700";
    }

    return "border-slate-100 text-slate-400 opacity-50";
  };

  return (
    <div className="game-card w-full max-w-2xl mx-auto p-6 md:p-10 animate-in fade-in zoom-in duration-300">
      <div className="flex justify-between items-center mb-8">
        <span className="text-xs font-bold tracking-wider text-slate-400 uppercase">Question {question.id}</span>
        <span className="bg-indigo-100 text-primary text-xs font-bold px-3 py-1 rounded-full">
          {question.points} PTS
        </span>
      </div>

      <h2 className="text-2xl md:text-3xl font-heading font-bold text-slate-800 mb-8 leading-tight">
        {question.text}
      </h2>

      <div className="space-y-4 mb-8">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => handleSelect(index)}
            disabled={isSubmitted}
            className={cn(
              "w-full text-left p-5 rounded-xl border-2 font-medium transition-all duration-200 flex items-center justify-between group",
              getOptionClass(index)
            )}
          >
            <span className="flex items-center gap-4">
              <span className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2",
                isSubmitted && index === question.correctAnswer ? "border-emerald-500 bg-emerald-500 text-white" :
                !isSubmitted && selectedOption === index ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-400 group-hover:border-primary/50"
              )}>
                {String.fromCharCode(65 + index)}
              </span>
              {option}
            </span>
            
            {isSubmitted && index === question.correctAnswer && (
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            )}
            {isSubmitted && selectedOption === index && index !== question.correctAnswer && (
              <XCircle className="w-6 h-6 text-rose-500" />
            )}
          </button>
        ))}
      </div>

      <div className="flex justify-end h-14">
        {!isSubmitted ? (
          <button 
            onClick={handleSubmit}
            disabled={selectedOption === null}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Submit Answer
          </button>
        ) : (
          <button 
            onClick={onNext}
            className="btn-secondary flex items-center gap-2 animate-in slide-in-from-bottom-2"
          >
            Next Question <ArrowRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
}
