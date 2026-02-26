import { BrowserRouter } from 'react-router-dom';
import { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export const RouterProvider = ({ children }: Props) => {
  return <BrowserRouter>{children}</BrowserRouter>;
};
