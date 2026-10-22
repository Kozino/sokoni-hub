import { createContext, useContext } from 'react';

/**
 * The one toast channel for the whole app. `App.tsx` provides it and renders the toast above the tab bar;
 * any screen can call `useToast().show('Added to cart', true)`.
 */
export const ToastContext = createContext<{ show: (text: string, cartLink?: boolean) => void }>({ show: () => {} });
export const useToast = () => useContext(ToastContext);
