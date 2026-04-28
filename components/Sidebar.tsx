
import React, { useContext, useState, useEffect } from 'react';
import { Page } from '../types';
import { Building2, LayoutDashboard, Users, ShoppingCart, PlusCircle, Scissors, Package, BarChart2, LogOut, Menu, X, DownloadCloud, Receipt, ShieldAlert, CalendarClock, CheckCircle, Trash, FileOutput, Key, Copy, Star, ShieldOff, Loader2, Scroll, Briefcase, Truck, UserCog, MessageSquare } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { downloadJsonFile } from '../utils/downloads';

interface SidebarProps {
    navigate: (page: Page) => void;
    currentPage: Page;
    onLogout: () => void;
}

const navItems = [
    { page: 'Dashboard', icon: LayoutDashboard },
    { page: 'Customers', icon: Users },
    { page: 'Orders', icon: ShoppingCart },
    { page: 'Add Order', icon: PlusCircle },
    { page: 'Inventory', icon: Package },
    { page: 'Material Sales', icon: Scroll },
    { page: 'Suppliers', icon: Truck },
    { page: 'Employees', icon: Briefcase },
    { page: 'Expenses', icon: Receipt },
    { page: 'Reports', icon: BarChart2 },
];

const masterAdminNavItems = [
    { page: 'SMS', icon: MessageSquare },
    { page: 'Users', icon: UserCog },
];

const NavLink: React.FC<{ page: Page; icon: React.ElementType; navigate: (page: Page) => void; currentPage: Page; closeMobileMenu: () => void }> = ({ page, icon: Icon, navigate, currentPage, closeMobileMenu }) => {
    const isActive = currentPage === page || (currentPage === 'Edit Order' && page === 'Orders');
    return (
        <button
            onClick={() => { navigate(page); closeMobileMenu(); }}
            className={`flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-colors duration-200 ${isActive ? 'bg-primary-500 text-white' : 'text-gray-600 hover:bg-primary-100 hover:text-primary-700'
                }`}
        >
            <Icon className="w-5 h-5 mr-3" />
            {page}
        </button>
    );
};

export const DeveloperToolsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const context = useContext(AppContext);
    const [password, setPassword] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [expiryDate, setExpiryDate] = useState('');
    const [message, setMessage] = useState('');

    const [genDateTime, setGenDateTime] = useState('');
    const [generatedKey, setGeneratedKey] = useState('');

    useEffect(() => {
        if (context?.settings?.appExpiryDate) {
            const dateObj = new Date(context.settings.appExpiryDate);
            const year = dateObj.getFullYear();
            const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
            const day = dateObj.getDate().toString().padStart(2, '0');
            const hours = dateObj.getHours().toString().padStart(2, '0');
            const minutes = dateObj.getMinutes().toString().padStart(2, '0');
            setExpiryDate(`${year}-${month}-${day}T${hours}:${minutes}`);
        } else {
            setExpiryDate('');
        }
    }, [context?.settings?.appExpiryDate]);

    const handleLogin = () => {
        if (password === '2003217124055') setIsAuthenticated(true);
        else alert("Access Denied");
    };

    const handleSetExpiry = () => {
        if (!context) return;
        const isoDate = new Date(expiryDate).toISOString();
        context.setSettings(prev => ({ ...prev, appExpiryDate: isoDate }));
        setMessage("PC Override Active.");
        setTimeout(() => setMessage(''), 3000);
    };

    const clearExpiry = () => {
        if (!context) return;
        if (window.confirm("Remove local override? App will return to build-in hardcoded license date.")) {
            context.setSettings(prev => {
                const newSettings = { ...prev };
                delete newSettings.appExpiryDate;
                return newSettings;
            });
            setExpiryDate('');
            setMessage("Override Cleared.");
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const toggleLifetime = () => {
        if (!context) return;
        const current = !!context.settings.lifetimeLicense;
        if (window.confirm(current ? "Revoke permanent license?" : "Grant PERMANENT access?")) {
            context.setSettings(prev => ({ ...prev, lifetimeLicense: !current }));
            setMessage(current ? "Lifetime Revoked." : "LIFETIME GRANTED.");
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const generateCode = () => {
        if (!genDateTime) return;
        const dt = new Date(genDateTime);
        const y = dt.getFullYear();
        const m = dt.getMonth() + 1;
        const d = dt.getDate();
        const h = dt.getHours();
        const min = dt.getMinutes();

        const checksum = (y + m + d + h + min) % 100;
        const datePart = `${y}${m.toString().padStart(2, '0')}${d.toString().padStart(2, '0')}${h.toString().padStart(2, '0')}${min.toString().padStart(2, '0')}`;
        const key = `BM-${datePart}-${checksum.toString().padStart(2, '0')}`;
        setGeneratedKey(key);
    };

    const copyKey = () => {
        navigator.clipboard.writeText(generatedKey);
        alert("Key copied.");
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-90 p-4 backdrop-blur-xl">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200">
                <div className="bg-slate-900 px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center">
                        <ShieldAlert className="mr-2 text-red-500 w-5 h-5" />
                        <h3 className="text-white font-black text-sm uppercase tracking-widest">Admin Authorization</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
                </div>

                <div className="p-8 overflow-y-auto max-h-[85vh]">
                    {!isAuthenticated ? (
                        <div className="space-y-6 py-4">
                            <div className="text-center space-y-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">Restricted Terminal</p>
                                <p className="text-xs text-slate-500">Accessing hardware level security tools</p>
                            </div>
                            <input type="password" className="w-full border-2 border-slate-100 bg-slate-50 p-4 rounded-xl text-center font-black text-2xl tracking-[0.5em] focus:border-primary-500 outline-none transition-all" placeholder="••••" value={password} onChange={e => setPassword(e.target.value)} autoFocus />
                            <button onClick={handleLogin} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg hover:bg-black transition-all">Authenticate</button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <div className={`p-5 rounded-2xl border-2 flex items-center justify-between transition-all ${context?.settings?.lifetimeLicense ? 'bg-amber-50 border-amber-200 ring-4 ring-amber-100' : 'bg-slate-50 border-slate-200'}`}>
                                <div>
                                    <h4 className={`font-black text-xs uppercase tracking-widest ${context?.settings?.lifetimeLicense ? 'text-amber-800' : 'text-slate-800'}`}>
                                        {context?.settings?.lifetimeLicense ? 'Lifetime License' : 'Standard License'}
                                    </h4>
                                    <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-tighter">Overrides all date-based locks</p>
                                </div>
                                <button
                                    onClick={toggleLifetime}
                                    className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center transition-all shadow-sm ${context?.settings?.lifetimeLicense
                                        ? 'bg-red-600 text-white hover:bg-red-700'
                                        : 'bg-amber-500 text-white hover:bg-amber-600'
                                        }`}
                                >
                                    {context?.settings?.lifetimeLicense ? <ShieldOff size={14} className="mr-2" /> : <Star size={14} className="mr-2" />}
                                    {context?.settings?.lifetimeLicense ? 'Revoke' : 'Grant'}
                                </button>
                            </div>

                            <div className="bg-primary-50 p-6 rounded-2xl border border-primary-100 space-y-4">
                                <h4 className="font-black text-primary-800 text-[10px] uppercase tracking-widest flex items-center"><Key size={14} className="mr-2" /> Remote Activation Generator</h4>
                                <div className="flex gap-2">
                                    <input type="datetime-local" className="flex-1 border-2 border-primary-200 p-2.5 rounded-xl text-xs font-bold" value={genDateTime} onChange={e => setGenDateTime(e.target.value)} />
                                    <button onClick={generateCode} className="bg-primary-600 text-white px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary-700 transition-all">Gen</button>
                                </div>
                                {generatedKey && (
                                    <div className="bg-white border-2 border-primary-300 rounded-xl p-4 flex items-center justify-between shadow-inner">
                                        <code className="text-sm font-black text-primary-900 tracking-widest">{generatedKey}</code>
                                        <button onClick={copyKey} className="text-primary-600 hover:bg-primary-50 p-2 rounded-lg transition-colors"><Copy size={18} /></button>
                                    </div>
                                )}
                            </div>

                            <div className="bg-red-50 p-6 rounded-2xl border border-red-100 space-y-4">
                                <h4 className="font-black text-red-800 text-[10px] uppercase tracking-widest flex items-center"><CalendarClock size={14} className="mr-2" /> Manual Revoke / Override</h4>
                                <div className="flex gap-2">
                                    <input type="datetime-local" className="flex-1 border-2 border-red-200 p-2.5 rounded-xl text-xs font-bold" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
                                    <button onClick={handleSetExpiry} className="bg-red-600 text-white px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all">Lock/Set</button>
                                    <button onClick={clearExpiry} className="bg-white text-red-600 border-2 border-red-200 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest" title="Clear Override">Reset</button>
                                </div>
                                <p className="text-[9px] text-red-400 font-black uppercase italic tracking-tight">Warning: Overrides the built-in license. Use 'Reset' to return to code defaults.</p>
                            </div>

                            {message && (
                                <div className="p-3 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center animate-pulse">
                                    <CheckCircle size={14} className="mr-2" /> {message}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const Sidebar: React.FC<SidebarProps> = ({ navigate, currentPage, onLogout }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const context = useContext(AppContext);
    const [devClickCount, setDevClickCount] = useState(0);
    const [showDevTools, setShowDevTools] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);

    const visibleNavItems = navItems.filter((item) => context?.canAccessPage(item.page as Page) ?? true);

    const handleDevClick = () => {
        setDevClickCount(prev => {
            const newCount = prev + 1;
            if (newCount === 19) { setShowDevTools(true); return 0; }
            return newCount;
        });
    };

    const handleBackup = async () => {
        if (!context || isBackingUp) return;
        setIsBackingUp(true);

        const { customers, orders, inventory, expenses, settings, employees, materialSales, suppliers } = context;
        const data = { customers, orders, inventory, expenses, settings, employees, materialSales, suppliers };
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `Tailor_Backup_${dateStr}.json`;

        try {
            downloadJsonFile(fileName, data);
            alert('Backup downloaded successfully.');
        } catch (error) {
            alert('Backup failed. Please try again.');
        } finally {
            setIsBackingUp(false);
        }
    };

    return (
        <>
            <div className="fixed z-20 lg:hidden top-4 left-4">
                <button onClick={() => setIsOpen(true)} className="p-2 bg-white border border-gray-200 rounded-md shadow-md text-gray-600"><Menu size={24} /></button>
            </div>

            <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-white shadow-xl transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex flex-col h-full">
                    <div className="px-4 py-5 border-b shrink-0 flex items-center justify-between">
                        <div className="flex items-center">
                            <Scissors className="w-8 h-8 text-primary-600" />
                            <span className="ml-3 text-xl font-bold text-primary-700">VIP Tailors & Fashion Pvt Ltd</span>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="lg:hidden text-gray-500"><X size={20} /></button>
                    </div>
                    <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
                        {visibleNavItems.map((item) => (
                            <NavLink key={item.page} page={item.page as Page} icon={item.icon} navigate={navigate} currentPage={currentPage} closeMobileMenu={() => setIsOpen(false)} />
                        ))}
                        {context?.currentUser?.role === 'master_admin' && masterAdminNavItems
                            .filter((item) => context?.canAccessPage(item.page as Page) ?? true)
                            .map((item) => (
                                <NavLink key={item.page} page={item.page as Page} icon={item.icon} navigate={navigate} currentPage={currentPage} closeMobileMenu={() => setIsOpen(false)} />
                            ))}
                    </nav>
                    <div className="px-4 py-4 border-t space-y-2 bg-white">
                        {context?.isCloudMode && context.currentUser?.role === 'master_admin' && (
                            <div className="px-4 py-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                                <div className="flex items-center text-[11px] font-black uppercase tracking-widest text-slate-500">
                                    <Building2 className="w-4 h-4 mr-2" />
                                    Branch Scope
                                </div>
                                <div className="text-xs font-semibold text-slate-700">
                                    {context.currentUser.username} ({context.currentUser.role.replace('_', ' ')})
                                </div>
                                {context.currentBranch && (
                                    <div className="text-[11px] text-slate-500">
                                        Access: {context.currentBranch.accessAreas.length > 0 ? context.currentBranch.accessAreas.map(area => area.replace('_', ' ')).join(', ') : 'Full branch access'}
                                    </div>
                                )}
                                <select
                                    value={context.currentUser.role === 'master_admin' ? context.activeBranchId : context.currentUser.branchId || ''}
                                    onChange={(event) => context.currentUser?.role === 'master_admin' && context.setActiveBranchId(event.target.value)}
                                    disabled={context.currentUser.role !== 'master_admin'}
                                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:bg-slate-100 disabled:text-slate-500"
                                >
                                    {context.currentUser.role === 'master_admin' && <option value="all">All Branches</option>}
                                    {context.branches.map(branch => (
                                        <option key={branch.id} value={branch.id}>
                                            {branch.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <button
                            onClick={handleBackup}
                            disabled={isBackingUp}
                            className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-600 rounded-lg hover:bg-blue-100 hover:text-blue-700 disabled:opacity-50"
                        >
                            {isBackingUp ? <Loader2 className="w-5 h-5 mr-3 animate-spin" /> : <DownloadCloud className="w-5 h-5 mr-3" />}
                            {isBackingUp ? 'Saving...' : 'Backup Data'}
                        </button>


                        <button onClick={onLogout} className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-600 rounded-lg hover:bg-red-100 hover:text-red-700"><LogOut className="w-5 h-5 mr-3" /> Logout</button>
                        <div className="mt-4 pt-2 text-center border-t border-gray-100 cursor-pointer select-none" onClick={handleDevClick}>
                            <p className="text-xs text-gray-500 font-medium hover:text-primary-600">Developed by ARM.Aswin</p>
                            <p className="text-xs text-gray-500">0778514532</p>
                        </div>
                    </div>
                </div>
            </aside>
            {isOpen && <div className="fixed inset-0 z-20 bg-black opacity-50 lg:hidden" onClick={() => setIsOpen(false)}></div>}
            {showDevTools && <DeveloperToolsModal onClose={() => setShowDevTools(false)} />}
        </>
    );
};

export default Sidebar;
