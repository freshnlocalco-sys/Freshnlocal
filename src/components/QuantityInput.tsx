import React, { useState, useEffect, useRef } from 'react';

interface QuantityInputProps {
  initialQuantity: number;
  isHoreca: boolean;
  minQuantity?: number;
  isDiscrete?: boolean;
  onUpdate: (newQuantity: number) => void;
  onRemove: () => void;
  className?: string;
}

export function QuantityInput({ initialQuantity, isHoreca, minQuantity, isDiscrete = true, onUpdate, onRemove, className = "" }: QuantityInputProps) {
  const [inputValue, setInputValue] = useState(initialQuantity.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) {
      if (isHoreca && initialQuantity === 0) {
        setInputValue(isDiscrete ? "1" : "0.0");
      } else {
        setInputValue(initialQuantity.toString());
      }
    }
  }, [initialQuantity, isHoreca, isDiscrete]);

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
    const minAllowed = minQuantity !== undefined ? minQuantity : (isDiscrete ? 1 : 0.01);

    if (isNaN(val) || val <= 0) {
      if (isHoreca) {
        setInputValue(isDiscrete ? "1" : "0.0");
        onUpdate(isDiscrete ? 1 : 0);
      } else {
        onRemove();
      }
    } else if (minAllowed > 0 && val < minAllowed) {
      setInputValue(minAllowed.toString());
      onUpdate(minAllowed);
    } else {
      const finalVal = isDiscrete ? Math.max(minAllowed, Math.round(val)) : val;
      setInputValue(finalVal.toString());
      onUpdate(finalVal);
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
      min={isDiscrete ? "1" : "0"}
      step={isDiscrete ? "1" : "any"}
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
