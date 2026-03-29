
// src/context/SchoolContext.tsx
// Provides school data (hsid, name, location, colors) to client components
// This avoids prop-drilling the data down from the server layout.

'use client';

import { createContext, ReactNode } from 'react';

// Define the shape of the school data
interface SchoolData {
  hsid: string;
  hsName: string | null;
  hsLocation: string | null;
  crestUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
}

// Create the context with a default value
export const SchoolContext = createContext<SchoolData | null>(null);

// Create the provider component
export default function SchoolContextProvider({ children, schoolData }: { children: ReactNode; schoolData: SchoolData }) {
  return (
    <SchoolContext.Provider value={schoolData}>
      {children}
    </SchoolContext.Provider>
  );
}
