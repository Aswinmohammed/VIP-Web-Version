import React, { useState, useContext, useMemo, useRef, useEffect } from 'react';
import { Customer } from '../types';
import { AppContext } from '../context/AppContext';

interface CustomerFormProps {
    customer?: Customer;
    onSave: (customer: Customer) => void | Promise<void>;
    onCancel: () => void;
}

const CustomerForm: React.FC<CustomerFormProps> = ({ customer, onSave, onCancel }) => {
    const context = useContext(AppContext);
    const { settings, setSettings } = context || {};
    
    const [formData, setFormData] = useState<Customer>(
        customer || { id: '', branchId: '', name: '', phone: '', address: '', email: '' }
    );
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(-1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const suggestionRef = useRef<HTMLDivElement>(null);

    const locations = useMemo(() => settings?.locations || [], [settings?.locations]);

    const filteredLocations = useMemo(() => {
        if (!formData.address) return [];
        return locations.filter(loc => 
            loc.toLowerCase().includes(formData.address.toLowerCase()) && 
            loc.toLowerCase() !== formData.address.toLowerCase()
        ).slice(0, 5);
    }, [formData.address, locations]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (suggestionRef.current && !suggestionRef.current.contains(event.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
        if (name === 'address') {
            setShowSuggestions(true);
            setSelectedIndex(-1);
        }
    };

    const handleSelectSuggestion = (loc: string) => {
        setFormData(prev => ({ ...prev, address: loc }));
        setShowSuggestions(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showSuggestions || filteredLocations.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < filteredLocations.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            handleSelectSuggestion(filteredLocations[selectedIndex]);
        } else if (e.key === 'Escape') {
            setShowSuggestions(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        
        try {
            // Auto-add new location to settings if not exists
            if (formData.address && settings && setSettings) {
                const trimmedLoc = formData.address.trim();
                const exists = settings.locations?.some(l => l.toLowerCase() === trimmedLoc.toLowerCase());
                if (!exists && trimmedLoc) {
                    setSettings({
                        ...settings,
                        locations: [...(settings.locations || []), trimmedLoc]
                    });
                }
            }

            await onSave(formData);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-40 backdrop-blur-[2px]">
            <div className="w-full max-w-lg p-10 bg-white rounded-xl shadow-2xl animate-in fade-in zoom-in duration-200">
                <h2 className="text-3xl font-bold mb-8 text-gray-900">{customer ? 'Edit Customer' : 'Add Customer'}</h2>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="name" className="block text-sm font-bold text-slate-700 mb-2">Name</label>
                        <input
                            type="text"
                            name="name"
                            id="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            autoFocus
                            className="w-full border border-slate-300 rounded-lg py-3 px-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                        />
                    </div>
                    <div>
                        <label htmlFor="phone" className="block text-sm font-bold text-slate-700 mb-2">Phone</label>
                        <input
                            type="tel"
                            name="phone"
                            id="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            required
                            className="w-full border border-slate-300 rounded-lg py-3 px-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                        />
                    </div>
                    <div className="relative" ref={suggestionRef}>
                        <label htmlFor="address" className="block text-sm font-bold text-slate-700 mb-2">Location</label>
                        <input
                            type="text"
                            name="address"
                            id="address"
                            placeholder="e.g. Kalmunai"
                            value={formData.address}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            onFocus={() => setShowSuggestions(true)}
                            autoComplete="off"
                            className="w-full border border-slate-300 rounded-lg py-3 px-4 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                        />

                        {/* Suggestions Dropdown */}
                        {showSuggestions && filteredLocations.length > 0 && (
                            <div className="absolute z-[110] left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
                                {filteredLocations.map((loc, index) => (
                                    <button
                                        key={loc}
                                        type="button"
                                        onClick={() => handleSelectSuggestion(loc)}
                                        className={`w-full text-left px-4 py-2.5 text-sm font-bold transition-colors ${index === selectedIndex ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {loc}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end pt-4 space-x-3">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className="px-6 py-2.5 text-sm font-bold text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-2.5 text-sm font-bold text-white bg-[#1d4ed8] rounded-lg shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
                        >
                            {isSubmitting ? 'Saving...' : 'Save Customer'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CustomerForm;
