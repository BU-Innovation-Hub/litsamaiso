import { createContext, useContext } from 'react';

export interface TourContextValue {
  /** Whether the signed-in user's role has a guided tour. */
  available: boolean;
  start: () => void;
}

export const TourContext = createContext<TourContextValue>({ available: false, start: () => undefined });

export const useTour = () => useContext(TourContext);
