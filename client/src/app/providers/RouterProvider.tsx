import { BrowserRouter } from 'react-router-dom';
import { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

const future = {
  v7_startTransition: true,
  v7_relativeSplatPath: true
};

export const RouterProvider = ({ children }: Props) => {
  return <BrowserRouter future={future}>{children}</BrowserRouter>;
};
