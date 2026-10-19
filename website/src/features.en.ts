import { features, type Feature } from './features'

type Translation = Omit<Feature, 'icon' | 'preview' | 'source'>

const translations: Translation[] = [
  { id: 'assistant', name: 'AI assistant', headline: 'Turn an idea into a clear direction.', summary: 'Discuss a reference, explain what should change and keep the details that matter.', boundary: 'Requires a conversation model. Image generation and editing also depend on your selected image model.', children: [
    { id: 'context', name: 'Discuss an image', description: 'Add an image explicitly to the assistant context.', steps: ['Choose an image on the board.', 'Use its reference action or open editing to add it to the task.', 'Explain what should change and what should stay.'] },
    { id: 'prompt', name: 'Refine an editing brief', description: 'Clarify the subject, background, light and constraints before generating.', steps: ['Describe the outcome.', 'Answer questions and refine constraints.', 'Review the description before running generation or editing.'] },
    { id: 'conversation', name: 'Continue a conversation', description: 'Keep discussing the same creative direction and reuse earlier context.', steps: ['Continue in the assistant.', 'Choose a direction.', 'Edit from an existing result.'] },
  ] },
  { id: 'images', name: 'Image generation & editing', headline: 'Give an existing image another possibility.', summary: 'Start from text or a reference. Preserve a product, change its scene or create a launch poster.', boundary: 'Reference images, editing and parameters vary by provider and model. Your provider bills for model calls.', children: [
    { id: 'generate', name: 'Generate from text', description: 'Describe an image and receive the result on the canvas.', steps: ['Configure an image provider.', 'Describe the subject, composition and style.', 'Choose a model and submit the task.'] },
    { id: 'reference', name: 'Use references', description: 'Give the model an existing subject or visual direction.', steps: ['Import or select an image.', 'Use the reference action in its toolbar.', 'Add a description and submit generation.'] },
    { id: 'remove-background', name: 'Remove a background', description: 'Use the supported image action, then inspect the transparent edges.', steps: ['Select an image.', 'Open more actions and choose background removal.', 'Inspect the subject edges and transparency.'] },
    { id: 'details', name: 'Inspect image details', description: 'Read the image information and prompt before reusing a result.', steps: ['Select a result.', 'Open image details.', 'Review its description and provenance.'] },
    { id: 'edit', name: 'Edit an existing image', description: 'Add a new version while preserving the original.', steps: ['Select an image and choose Edit.', 'Confirm the target and describe the change.', 'Run the edit and inspect the new version.'] },
  ] },
  { id: 'templates', name: 'Templates', headline: 'Keep a useful method for next time.', summary: 'Reuse prompts and rules, or extract editable rules from a reference.', boundary: 'AI-assisted creation and extraction require the relevant models and human review. A template is not a fixed finished image.', children: [
    { id: 'use', name: 'Browse and use templates', description: 'Review an example, fill in its fields and start creating.', steps: ['Open the template library.', 'Review the example and prompt fields.', 'Fill in this task’s content and submit.'] },
    { id: 'create', name: 'Create a template', description: 'Maintain fields manually or ask the assistant to help create them.', steps: ['Choose Create in the template library.', 'Choose manual or AI-assisted creation.', 'Review the content and example before saving.'] },
    { id: 'extract', name: 'Extract rules from an image', description: 'Turn a reference’s visual and content rules into an editable template.', steps: ['Select a reference and open template extraction.', 'Review the extracted rules.', 'Edit and save the template.'] },
    { id: 'transfer', name: 'Import and export templates', description: 'Move reusable methods between workspaces.', steps: ['Import a template file in the library.', 'Inspect the imported fields.', 'Export your template when moving it elsewhere.'] },
  ] },
  { id: 'assets', name: 'Asset library', headline: 'Find a good asset without starting over.', summary: 'Find generated, imported and sliced images or videos using search, source filters and favorites.', boundary: 'Assets are stored locally in the desktop app. Required references are sent to your selected model provider.', children: [
    { id: 'collect', name: 'Collect images and videos', description: 'Browse media generated or imported into the local workspace.', steps: ['Generate or import media.', 'Open the asset library.', 'Select an image or video.'] },
    { id: 'search', name: 'Search and filter', description: 'Search prompts, tags and boards; filter by media type or source.', steps: ['Enter a keyword.', 'Apply media and source filters.', 'Open the matching asset.'] },
    { id: 'favorites', name: 'Favorite and reuse', description: 'Keep frequently used references easy to find.', steps: ['Favorite an asset.', 'Use the favorites filter.', 'Add it to a board or a new task.'] },
  ] },
  { id: 'canvas', name: 'Boards & versions', headline: 'References, attempts and results in one space.', summary: 'Arrange assets on an infinite canvas, revisit attempts and compare versions before choosing a direction.', boundary: 'Desktop boards and assets are local. Export a board package for backup or migration. Website examples do not save editable desktop boards.', children: [
    { id: 'arrange', name: 'Arrange an infinite canvas', description: 'Pan, zoom and move references and results together.', steps: ['Create or open a board.', 'Import references and results.', 'Drag, pan and zoom to arrange them.'] },
    { id: 'versions', name: 'Switch and compare versions', description: 'Keep editing results on one node and compare them with the original.', steps: ['Edit an existing image.', 'Switch versions using the image controls.', 'Open comparison to inspect the changes.'] },
    { id: 'boards', name: 'Manage boards', description: 'Search, rename, sort and import boards for different projects.', steps: ['Open the board library.', 'Search or filter the list.', 'Open, rename or import a board.'] },
    { id: 'trash', name: 'Recover removed content', description: 'Review recoverable boards and images before permanently removing them.', steps: ['Open the appropriate board or image recovery view.', 'Select an item to restore.', 'Return to the workspace and verify it.'] },
    { id: 'history', name: 'Generation history', description: 'Find earlier tasks and results before continuing.', steps: ['Open generation history.', 'Inspect the task and images.', 'Locate a result or reuse its inputs.'] },
  ] },
  { id: 'video', name: 'Video creation', headline: 'Continue a still image as a moving concept.', summary: 'Generate from text or a reference image, track tasks and export the result.', boundary: 'Text-to-video, image-to-video and available parameters depend on your selected video model. Provider fees apply.', children: [
    { id: 'text-video', name: 'Generate video from text', description: 'Describe the shot, subject and motion.', steps: ['Configure a video provider.', 'Describe the scene and motion.', 'Choose supported parameters and submit.'] },
    { id: 'image-video', name: 'Animate from a reference', description: 'Use an existing image with a model that supports image-to-video.', steps: ['Choose an image reference.', 'Describe the intended motion.', 'Submit with a compatible model.'] },
    { id: 'manage-video', name: 'Track and export video', description: 'Check task status, play finished videos and export local files.', steps: ['Inspect the video task.', 'Play the completed result.', 'Export the file.'] },
  ] },
  { id: 'export', name: 'Slicing & export', headline: 'Turn a finished image into deliverable assets.', summary: 'Crop freely or slice a grid, then save the assets to a local project.', boundary: 'Sharing and design-file reconstruction require the relevant configuration. Available actions vary by media type and settings; inspect exported files.', children: [
    { id: 'crop', name: 'Free crop', description: 'Extract the region you need.', steps: ['Open slicing on an image.', 'Choose free crop and adjust the region.', 'Confirm and inspect the extracted image.'] },
    { id: 'grid', name: 'Grid slicing', description: 'Split an image into selected rows and columns.', steps: ['Open grid slicing.', 'Choose a grid or set rows and columns.', 'Inspect the cells and confirm.'] },
    { id: 'save', name: 'Save and deliver images', description: 'Export a chosen version for design or development.', steps: ['Choose the version to deliver.', 'Use Save or Download.', 'Check dimensions, file format and content.'] },
    { id: 'share', name: 'Share an image', description: 'Create or manage a share using your configured sharing service.', steps: ['Select an image.', 'Choose quick sharing in more actions.', 'Create or manage the share using the current settings.'] },
    { id: 'design', name: 'Reconstruct an editable design', description: 'Use the MasterGo integration and inspect the reconstructed result.', steps: ['Choose editable-design reconstruction in image actions.', 'Complete the connection and reconstruction flow.', 'Review the design before editing it.'] },
    { id: 'sticker', name: 'Export WeChat stickers', description: 'Prepare a dedicated sticker export.', steps: ['Enable the relevant action in settings.', 'Choose WeChat sticker export in image actions.', 'Inspect the preview and export.'] },
  ] },
  { id: 'models', name: 'Models & settings', headline: 'Connect the models you choose.', summary: 'Configure separate image, video and conversation providers with your API key or supported account authorization.', boundary: 'Iterlay does not sell model credits. Capabilities, fees and availability are determined by your provider.', children: [
    { id: 'providers', name: 'Configure providers', description: 'Use different providers for images, video and conversation.', steps: ['Open Settings → AI Services.', 'Add a provider and its required credentials.', 'Choose default models for each capability.'] },
    { id: 'auth', name: 'API key or account authorization', description: 'Use the authentication method supported by your provider.', steps: ['Choose the provider.', 'Complete its supported authorization.', 'Review the setup and the exact scope of any test.'] },
    { id: 'preferences', name: 'Workspace preferences', description: 'Adjust interface and interaction preferences.', steps: ['Open Settings.', 'Choose a preference group.', 'Change a setting and verify it in the workspace.'] },
  ] },
  { id: 'agent', name: 'Coding Agent', headline: 'Give your coding agent visual work to do.', summary: 'Let Codex or Claude Code use the CLI and Skill to generate, edit and export with the providers saved in Iterlay.', boundary: 'Uses CLI + Skill. Install and configure Iterlay first; the public website is not a live agent connection.', children: [
    { id: 'setup', name: 'Install the CLI and Skill', description: 'Install or repair the integration from settings.', steps: ['Open Settings → Coding Agent.', 'Check the CLI installation.', 'Install the Skill for your agent.'] },
    { id: 'automation', name: 'Generate and edit assets', description: 'Use the models and authorization already saved in the app.', steps: ['Give the agent a concrete task.', 'Submit image or video work with the CLI.', 'Review results in the app.'] },
    { id: 'deliver', name: 'Arrange and export', description: 'Place assets on a board and export them to a project directory.', steps: ['Specify results and the target directory.', 'Ask the agent to arrange or export them.', 'Check the actual files and dimensions.'] },
  ] },
  { id: 'plugins', name: 'Plugins', headline: 'Open a tool for a specific creative task.', summary: 'Install and manage plugins that extend the workflow, such as short-drama production.', boundary: 'Capabilities vary by installed plugin and version. Short-drama tools require the matching plugin; this is not a general-purpose agent SDK.', children: [
    { id: 'install', name: 'Install and manage plugins', description: 'Import a package and review its permissions.', steps: ['Open plugin management.', 'Import an .iterlay-plugin package.', 'Review permissions and enable it.'] },
    { id: 'drama', name: 'Short-drama production', description: 'Plan characters and storyboards with the matching plugin.', steps: ['Install and enable the short-drama plugin.', 'Open its project tools.', 'Review the plan and generate media through the app.'] },
    { id: 'develop', name: 'Develop a plugin', description: 'Build controlled tool panels and settings with the project SDK.', steps: ['Read the plugin development documentation.', 'Build and package using the SDK.', 'Import it in the app and verify permissions and behavior.'] },
  ] },
]

export const featuresEn: Feature[] = features.map(feature => ({
  ...feature,
  ...translations.find(item => item.id === feature.id)!,
}))
