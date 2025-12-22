# 🌐 Glou Web Application

The modern, responsive web interface for the Glou wine cellar management system. Built with React, Vite, and Material UI.

**[English]** | **[Français](../FR/WEB_README.md)**

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+**
- **npm 9+**

### Installation
```bash
# Install dependencies
npm install
```

### Development
```bash
# Start the development server
npm run dev
```
The application will be available at `http://localhost:5173`. By default, it expects the API to be running at `http://localhost:8080`.

### Production Build
```bash
# Build for production
npm run build
```
The optimized assets will be generated in the `dist/` folder.

---

## 🛠️ Tech Stack

- **Framework**: [React 18](https://reactjs.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Data Fetching**: [React Query](https://tanstack.com/query/v3)
- **Styling**: [Material UI](https://mui.com/)
- **Charts**: [Chart.js](https://www.chartjs.org/) with `react-chartjs-2`
- **Routing**: [React Router 6](https://reactrouter.com/)

---

## 📁 Project Structure

- `src/components/`: Reusable UI components (Heatmaps, Cards, etc.)
- `src/hooks/`: Custom React hooks for data fetching and logic.
- `src/screens/`: Main application pages (Dashboard, Inventory, Settings).
- `src/store/`: Zustand store for global state management.
- `src/theme/`: Material UI theme configuration.

---

## 🤝 Contributing

Please refer to the main [Development Guide](../DEVELOPMENT.md) for contribution instructions.

### Useful Commands

- `npm run dev` - Start development server with HMR
- `npm run build` - Optimized production build
- `npm run preview` - Preview production build locally
- `npm run lint` - Check code with ESLint
- `npm run format` - Format code with Prettier

---

## Notes

- The frontend uses Vite and proxies API calls to the Go backend (default port 8080).
- Ensure the `api` binary is running locally when developing.
- For production, the Go server serves the built assets automatically.

### CSRF for mutating requests
When authenticated, the server sets a `glou_csrf` cookie. For any POST/PUT/DELETE API call, include the same value in the `X-CSRF-Token` header. Example with `fetch`:

```js
function getCookie(name) {
	return document.cookie
		.split('; ')
		.find(c => c.startsWith(name + '='))?.split('=')[1];
}

const csrf = getCookie('glou_csrf');
await fetch('/wines', {
	method: 'POST',
	headers: {
		'Content-Type': 'application/json',
		'X-CSRF-Token': csrf
	},
	body: JSON.stringify({ name: 'Example', region: 'Bordeaux', vintage: 2020, type: 'Red' })
});
```
