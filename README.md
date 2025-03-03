# SocialStack Tools

This is a command line interface for creating, managing and compiling SocialStack projects. For more help and guidance, check the wiki at https://wiki.socialstack.dev/

# Installation

`npm install -g socialstack`

# Configuration

Only do this on a development machine. It's not needed anywhere else.

```
	-- Create the user account:
	CREATE USER 'sstools'@'localhost' IDENTIFIED BY 'ssto0ls.dev'; -- Invent a password here!
	-- Grant that user full access to the db:
	GRANT ALL PRIVILEGES ON *.* TO 'sstools'@'localhost' WITH GRANT OPTION;
	FLUSH PRIVILEGES;
```

```
socialstack configure -u "sstools" -p "ssto0ls.dev"
```

A few actions that the socialstack tools perform require MySQL admin rights on a development machine. This is so it can, for example, automatically create new databases for you. Whilst optional, it's highly recommended to set this access up. The account details are stored in a file which can also be located by running `socialstack configuration`.

## Dependencies

Currently socialstack projects require the following:

* [.NET Core 8.0 SDK](https://dotnet.microsoft.com/download/dotnet-core/6.0). If you're not sure if you already have this installed, you can run `dotnet --list-sdks` to find out.
* If you're using Visual Studio, note that 2022 or newer is required for .NET Core 8.0.
* MySQL. Version 8 is recommended.
* Git
* Node.js 8+ is optional and only used for running these tools

## Creating a project

`socialstack create`

Run this to create a new blank SocialStack project in your working directory. Optionally provide it a domain name like this:

`socialstack create example.com`
 
This will also create a database for you too, if you've setup your database config (see above).

## Installing modules

`socialstack i Api/HelloWorld`

This will install the named module(s) from any repositories you have configured. You can list multiple here to install them all. You can also use package names:

`socialstack i Tags`

## Uninstalling modules

`socialstack uninstall Api/HelloWorld`

Remove modules (or packages) with the uninstall command. Like the install command, you can list multiple modules.

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

# Contributing

To make changes to socialstack tools itself, it's a good idea to link the repository such that you can easily iterate on changes you make.

* Clone this repository
* Run `npm install` in the repository. This'll download the modules it depends on.
* Run `npm link` in the repository. This will make the code in the repository run directly when you try `socialstack` commands.

If everything is good, it's the usual `npm version patch` and `npm publish` from an authed npm account.