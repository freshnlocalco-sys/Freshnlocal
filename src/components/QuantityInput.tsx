import React, { useState, useEffect, useRef } from 'react';

interface QuantityInputProps {
  initialQuantity: number;
  isHoreca: boolean;
  onUpdate: (newQuantity: number) => void;
  onRemove: () => void;
  className?: string;
}

export function QuantityInput({ initialQuantity, isHoreca, onUpdate, onRemove, className = "" }: QuantityInputProps) {
  const [inputValue, setInputValue] = useState(initialQuantity.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      setInputValue(initialQuantity.toString());
    }
  }, [initialQuantity]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let valStr = e.target.value;
    setInputValue(valStr);
    
    const val = parseFloat(valStr);
    if (!isNaN(val) && val >= 0) {
      onUpdate(val);
    } else if (valStr === '') {
      onUpdate(0);
    }
  };

  const handleBlur = () => {
    let val = parseFloat(inputValue);
    if (isNaN(val) || val <= 0) {
      onRemove();
    } else {
      setInputValue(val.toString());
      onUpdate(val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      type="number"
      min="0"
      step="any"
      value={inputValue}
      title="Type custom quantity"
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      className={className || "w-14 text-center font-bold text-xs text-foreground bg-transparent outline-none border-b border-dashed border-foreground/30 focus:border-primary mx-1 py-1"}
    />
  );
}
