; Inno Setup Script for HongguoTool v2.0
#define MyAppName "红果短剧电商商家赋能工具"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "HongguoMerchantTools"
#define MyAppExeName "HongguoTool.exe"

[Setup]
AppId={{8F9E7A21-4B0D-4B2C-9E3A-1D6B8E5B2026}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\HongguoTool
DefaultGroupName={#MyAppName}
OutputDir=..\dist_win
OutputBaseFilename=HongguoTool-Setup-v{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "chinesesimplified"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist_win\HongguoTool\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
