import { createBrowserRouter } from 'react-router-dom';

import { AppLayout } from '@/app-layout';
import { ConfigPage } from '@/routes/config-page';
import { DisplayPage } from '@/routes/display-page';
import { HomePage } from '@/routes/home-page';
import { NotFoundPage } from '@/routes/not-found-page';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <HomePage />,
      },
      {
        path: 'config',
        element: <ConfigPage />,
      },
      {
        path: 'display/:displayId',
        element: <DisplayPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
