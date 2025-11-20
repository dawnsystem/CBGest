
import React, { useState, useEffect, useRef } from 'react';
import { Search, Check } from 'lucide-react';
import { ACCOUNT_PLAN, AccountOption } from '../utils/accountingPlan';

interface AccountSelectorProps {
  value: string; // Format: "CODE - NAME" or just "CODE"
  onChange: (value: string) => void;
  className?: string;
}

export const AccountSelector: React.FC<AccountSelectorProps> = ({ value, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Extract initial value logic
  useEffect(() => {
    // Sync internal state with external value if it changes externally
    if (value !== searchTerm) {
        setSearchTerm(value);
    }
  }, [value]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const filteredAccounts = ACCOUNT_PLAN.filter(account => {
    const term = searchTerm.toLowerCase();
    return account.code.toLowerCase().includes(term) || 
           account.name.toLowerCase().includes(term) ||
           `${account.code} - ${account.name}`.toLowerCase().includes(term);
  });

  const handleSelect = (account: AccountOption) => {
    const fullValue = `${account.code} - ${account.name}`;
    setSearchTerm(fullValue);
    onChange(fullValue);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setSearchTerm(newValue);
      setIsOpen(true);
      onChange(newValue); // Propagate manual typing immediately
  };

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <div className="relative">
        <input
          type="text"
          className="w-full border border-slate-200 rounded text-sm p-2 pl-8 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-slate-900"
          placeholder="Buscar cuenta (ej: 628 o Luz)..."
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
        />
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
      </div>

      {isOpen && filteredAccounts.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl max-h-60 overflow-auto">
          {filteredAccounts.map(account => (
            <div
              key={account.code}
              onClick={() => handleSelect(account)}
              className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b border-slate-50 last:border-none flex items-center justify-between group"
            >
              <div>
                <span className="font-mono font-bold text-slate-700 text-xs bg-slate-100 px-1.5 py-0.5 rounded mr-2">
                  {account.code}
                </span>
                <span className="text-sm text-slate-600 group-hover:text-blue-700">
                  {account.name}
                </span>
              </div>
              {value.startsWith(account.code) && <Check className="w-4 h-4 text-blue-600" />}
            </div>
          ))}
        </div>
      )}
      
      {isOpen && searchTerm && filteredAccounts.length === 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs text-slate-500 text-center">
              Usa una cuenta personalizada o selecciona de la lista.
          </div>
      )}
    </div>
  );
};
