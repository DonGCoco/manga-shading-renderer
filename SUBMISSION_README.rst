Project Submission (EDAF35)
==========================

Title
-----
Screen-Space Silhouette Lines and Manga-Style Rendering in a Deferred Shading Pipeline

Authors
-------
- Dong Jieru
- Pan Zhenling


Repository layout
-----------------
Project root contains:
- CMakeLists.txt
- CMake/
- dependencies/
- res/
- shaders/
- src/ (including src/EDAN35/assignment2.* and framework code)

Target / Entry Point
--------------------
Target executable: EDAN35_Assignment2


Build (Windows / Visual Studio 2019)
------------------------------------
Tested toolchain:
- Visual Studio 2019 (MSVC v142)
- Windows 10 SDK 10.0.18362.0
- CMake + Git

Steps (x64 Native Tools Command Prompt for VS 2019):
1) cd <project_root>
2) cmake -S . -B build -G "Visual Studio 16 2019" -A x64
3) cmake --build build --config Release --target EDAN35_Assignment2


Build (Ubuntu/Linux)
--------------------
1) cd <project_root>
2) cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
3) cmake --build build -j --target EDAN35_Assignment2

Run (Linux)
-----------
From <project_root>, run the built executable under build/.
If needed, locate it with:
find build -maxdepth 4 -type f -name "EDAN35_Assignment2*"

Controls / UI
-------------
- Use the ImGui panel to switch rendering modes and adjust parameters.
- Parameters for toon shading (banding), silhouette/outlines, and manga-style
  grayscale output are available in the UI (if enabled in the build).


