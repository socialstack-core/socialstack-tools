# SocialStack Tools

This is a command line interface for creating, managing and compiling the UI's of SocialStack projects.

# Installation

`npm install -g socialstack`

# Configuration

Only do this on a development machine. It's not needed anywhere else.

```
	-- Create the user account:
	CREATE USER 'sstools'@'localhost' IDENTIFIED BY 'sstools!'; -- Invent a password here!
	-- Grant that user full access to the db:
	GRANT ALL PRIVILEGES ON *.* TO 'sstools'@'localhost' WITH GRANT OPTION;
	FLUSH PRIVILEGES;
```

```
socialstack configure -u "sstools" -p "sstools!"
```

A few actions that the socialstack tools perform require MySQL admin rights on a development machine. This is so it can, for example, automatically create new databases for you. Whilst optional, it's highly recommended to set this access up. The account details are stored in a file which can also be located by running `socialstack configuration`.

# Basic usage

SocialStack tools are used directly by a running API (unless disabled, which you can do by just omitting your UI/Source directory), so typically in development to use the file watcher you just need to start your API.

## Dependencies

Currently socialstack projects require the following:

* Node.js 8+
* [.NET Core 3.1 SDK](https://dotnet.microsoft.com/download/dotnet-core/3.1). If you're not sure if you already have this installed, you can run `dotnet --list-sdks` to find out.
* If you're using Visual Studio, 2019 or newer is required for .NET Core 3.1.
* MySQL. Version 8 is recommended.
* Git

## Creating a project

`socialstack create`

Run this to create a new blank SocialStack project in your working directory. Optionally provide it a domain name like this:

`socialstack create example.com`
 
This will also create a database for you too, if you've setup your database config (see above).

## Installing modules

`socialstack i Api/HelloWorld`

This will install the named module(s) from any repositories you have configured, as a submodule. You can list multiple here to install them all. You can also use package names:

`socialstack i Tags`

## Uninstalling modules

`socialstack uninstall Api/HelloWorld`

Remove modules (or packages) with the uninstall command. Like the install command, you can list multiple modules.

## Watching for UI changes

`socialstack watch`

This will start a watcher which checks for changes in your UI/Source and Admin/Source directories. When a change happens, your UI will be rebuilt. This process doesn't exit.

## Builds

Commands which build your project.

### Build everything

If you'd like to build the UI, the API and optionally native apps with Cordova, use the build command:

`socialstack build -prod`

-prod is optional, but will minify and pre-gzip the UI builds for you. It's recommended for pipelines to use this build command.

### Api builds

Whilst you can just use your preferred mechanism for building a C# project, a convenience API build command is included. It defaults to outputting into `Api/build`.

`socialstack buildapi`

Note that the API is separate from the UI, so there is no order requirement - you can build the API and UI in whatever order you want, or build everything as seen above.

### UI builds

`socialstack buildui`

This builds UI/Source and Admin/Source, then quits. If you'd like to make a production (minified and pre-gzipped) build, add the -prod flag:

`socialstack buildui -prod`

## SSMF - SocialStack Migration Framework

In the future this will be used to automatically convert websites to or from other frameworks via simple, shared commands.

# Contributing

To make changes to socialstack tools itself, it's a good idea to also grab the [React lite builder](https://source.socialstack.cf/infrastructure/react-lite-builder) project:

* Clone both this repository and react-lite-builder
* Run `npm install` in each. This'll download the modules they each depend on.
* Run `npm link` inside the react-lite-builder directory. This makes it available as an npm link.
* Run `npm link react-lite-builder` inside the tools directory. This uses the link you just made.

Linking like this means you can change files in react-lite-builder and have those changes available directly to what you're working on in the tools directory.

To test out your tools changes, open up a command prompt in a socialstack project, then run:

`node C:/path/to/socialstack-tools-checkout/bin/socialstack.js ...`

where ... is the command line args you want to try, as if you'd run `socialstack ...` instead.

If everything is good, it's the usual `npm version patch` and `npm version publish` from an authed npm account.