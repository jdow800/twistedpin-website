import React from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/styles/global.css';
import LiquorApp from '../../src/components/liquor/LiquorApp';
createRoot(document.getElementById('root')).render(<LiquorApp />);
