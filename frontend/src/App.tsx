function App() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-base-100 text-base-content">
      {/* Sidebar / Master */}
      <aside className="w-[250px] min-w-[250px] bg-base-200 border-r border-base-300 flex flex-col h-full overflow-y-auto">
        <div className="p-4 flex flex-col gap-3">
          <div className="h-[30px]"></div>
          
          <ul className="menu bg-base-200 w-full p-0 gap-1">
            <li><a className="hover:bg-base-300 rounded-md">Presets</a></li>
            <li><a className="hover:bg-base-300 rounded-md">LED Streifen links</a></li>
            <li><a className="hover:bg-base-300 rounded-md">LED Streifen rechts</a></li>
          </ul>
        </div>
      </aside>

      {/* Main Content / Detail */}
      <main className="flex-grow bg-base-100 h-full overflow-y-auto">
        <div className="p-6 flex flex-col gap-4">
          <h1 className="text-2xl font-bold">Detail View</h1>
          <p className="text-base-content/70">
            Select an item from the sidebar to view details here.
          </p>
          
          {/* Placeholder Content */}
          <div className="border border-dashed border-base-300 rounded-lg flex items-center justify-center bg-base-200/50 py-10">
            <span className="text-base-content/50">Content Area</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;